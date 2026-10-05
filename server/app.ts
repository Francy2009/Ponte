import express from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import OpenAI from "openai";
import { z } from "zod";
import { getAiConfig, callStructuredModel, AiError, type AiConfig } from "./ai";
import { RequestError } from "./errors";
import { serverSettings, type ServerSettings } from "./settings";
import { AiBudget } from "./budget";
import { analysisSchema, inputSchema } from "../shared/schema";
import { examples } from "../shared/examples";
import { verifyAnalysis, demoAnswer } from "./core";
import {
  analyzeWithEvidence,
  answerWithEvidence,
  answerSchema,
  verifyAnswer,
} from "./quality";
import { extractPdf, PDF_CONCURRENCY } from "./pdf";

export function createApp(
  options: {
    settings?: ServerSettings;
    aiConfig?: AiConfig;
    fetcher?: typeof fetch;
    readPdf?: typeof extractPdf;
    distPath?: string;
  } = {},
) {
  const settings = options.settings ?? serverSettings();
  const aiConfig = options.aiConfig ?? getAiConfig();
  const readPdf = options.readPdf ?? extractPdf;
  const distPath = options.distPath ?? path.resolve("dist");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", settings.trustProxy || false);
  app.use(
    helmet({
      contentSecurityPolicy: settings.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              fontSrc: ["'self'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'none'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: settings.origin?.startsWith("https:")
                ? []
                : null,
            },
          }
        : false,
      strictTransportSecurity:
        settings.production && settings.origin?.startsWith("https:")
          ? { maxAge: 31536000, includeSubDomains: false }
          : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((req, res, next) => {
    res.setHeader("X-Request-Id", randomUUID());
    if (!req.path.startsWith("/assets/"))
      res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const limiter = (limit: number, message: string, identifier: string) =>
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      identifier,
      message: { error: message },
      validate: { xForwardedForHeader: false },
    });
  app.use(
    "/api",
    limiter(
      settings.apiLimit,
      "Too many requests. Please wait a few minutes and try again.",
      "ponte-api",
    ),
  );
  app.use("/api", (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get("Origin");
    const allowed = settings.origin ?? `${req.protocol}://${req.get("host")}`;
    if (
      req.get("Sec-Fetch-Site") === "cross-site" ||
      (origin && origin !== allowed)
    ) {
      next(new RequestError("Requests must come from the Ponte website.", 403));
      return;
    }
    next();
  });
  app.use(express.json({ limit: "256kb", strict: true }));
  app.use(["/api/analyze", "/api/chat", "/api/demo"], (req, _res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    if (!req.is("application/json")) {
      next(new RequestError("Send this request as JSON.", 415));
      return;
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      next(new RequestError("A JSON object is required."));
      return;
    }
    next();
  });
  const aiLimiter = limiter(
    settings.aiLimit,
    "Too many analysis or chat requests. Please wait a few minutes and try again.",
    "ponte-ai",
  );
  app.use(["/api/analyze", "/api/chat"], (req, res, next) => {
    if (
      req.method !== "POST" ||
      (req.baseUrl === "/api/chat" && req.body?.exampleId)
    ) {
      next();
      return;
    }
    aiLimiter(req, res, next);
  });
  app.use(
    "/api/extract",
    limiter(
      8,
      "Too many PDF uploads. Please wait a few minutes and try again.",
      "ponte-pdf",
    ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  const readUpload: express.RequestHandler = (req, res, next) =>
    upload.single("file")(req, res, (error) => {
      next(
        error && !(error instanceof multer.MulterError)
          ? new RequestError(
              "The PDF upload could not be read. Choose the file again.",
            )
          : error,
      );
    });
  let uploads = 0;
  const reserveUpload: express.RequestHandler = (_req, res, next) => {
    if (uploads >= PDF_CONCURRENCY) {
      next(
        new RequestError(
          "PDF processing is busy. Please try again shortly.",
          503,
        ),
      );
      return;
    }
    uploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        uploads--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  const budget = new AiBudget(settings.aiDailyLimit);
  let active = 0;
  async function model<T>(schema: z.ZodType<T>, name: string, input: unknown) {
    if (active >= 3)
      throw new AiError("The service is busy. Please try again shortly.", 429);
    active++;
    try {
      return await callStructuredModel(
        schema,
        name,
        input,
        aiConfig,
        options.fetcher ?? fetch,
        budget.take,
      );
    } finally {
      active--;
    }
  }
  app.get("/api/config", (_req, res) =>
    res.json({
      aiAvailable: !!aiConfig.apiKey,
      provider: aiConfig.label,
      model: aiConfig.model,
      limits: { megabytes: 10, pages: 20, characters: 60000 },
    }),
  );
  app.get("/api/examples", (_req, res) =>
    res.json(examples.map(({ analysis, ...example }) => example)),
  );
  app.post(
    "/api/extract",
    reserveUpload,
    readUpload,
    async (req, res, next) => {
      try {
        if (!req.file) throw new RequestError("Choose a PDF.");
        res.json({
          pages: await readPdf(req.file.buffer, {
            timeoutMs: settings.pdfTimeoutMs,
          }),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post("/api/demo", async (req, res, next) => {
    try {
      const id = z.string().parse(req.body.id);
      const example = examples.find((e) => e.id === id);
      if (!example) throw new RequestError("Example unavailable.");
      const pages = [{ number: 1, text: example.text }];
      res.json({
        analysis: verifyAnalysis(example.analysis, pages),
        pages,
        mode: "demo",
        exampleId: id,
        name: example.title,
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/analyze", async (req, res, next) => {
    try {
      const input = inputSchema.parse(req.body);
      const analysis = await analyzeWithEvidence(input, (request) =>
        model(analysisSchema, "document_analysis", request),
      );
      res.json({
        analysis,
        pages: input.pages,
        mode: "ai",
        name: "Your notice",
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/chat", async (req, res, next) => {
    try {
      const question = z.string().min(1).max(500).parse(req.body.question);
      let answer;
      let pages;
      if (req.body.exampleId) {
        const example = examples.find((e) => e.id === req.body.exampleId);
        if (!example) throw new RequestError("Example unavailable.");
        pages = [{ number: 1, text: example.text }];
        answer = demoAnswer(question, example.analysis);
      } else {
        const input = inputSchema.parse(req.body);
        pages = input.pages;
        const result = await answerWithEvidence(
          { ...input, question },
          (request) => model(answerSchema, "document_answer", request),
        );
        res.json(result);
        return;
      }
      res.json(verifyAnswer(answer, pages));
    } catch (e) {
      next(e);
    }
  });

  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint unavailable." }),
  );
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      immutable: true,
      maxAge: "1y",
      dotfiles: "deny",
      fallthrough: false,
    }),
  );
  app.use(express.static(distPath, { dotfiles: "deny", index: false }));
  app.get("/{*splat}", (req, res) => {
    if (req.path.split("/").some((part) => part.includes("."))) {
      res.status(404).json({ error: "Resource unavailable." });
      return;
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent || res.destroyed) return;
      let status = 500,
        message =
          "The service could not complete this request. Please try again.";
      const type =
        err && typeof err === "object" && "type" in err ? err.type : undefined;
      if (err instanceof RequestError) {
        status = err.status;
        message = err.message;
      } else if (err instanceof multer.MulterError) {
        status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        message =
          err.code === "LIMIT_FILE_SIZE"
            ? "The PDF exceeds the 10 MB limit."
            : "Upload one PDF only, without additional fields.";
      } else if (err instanceof z.ZodError) {
        status = 400;
        message = "Invalid input. Check the document text and size limits.";
      } else if (type === "entity.too.large") {
        status = 413;
        message =
          "The request is too large. Use a document within the supported limits.";
      } else if (type === "entity.parse.failed") {
        status = 400;
        message = "The request contains invalid JSON. Please try again.";
      } else if (err instanceof OpenAI.APIError) {
        status = 502;
        message = "The AI provider is unavailable. Please try again later.";
      } else if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        [403, 404].includes(Number(err.status))
      ) {
        status = Number(err.status);
        message = "Resource unavailable.";
      }
      if (status === 429)
        res.setHeader(
          "Retry-After",
          String(
            err instanceof RequestError && err.retryAfter ? err.retryAfter : 60,
          ),
        );
      if (status === 503) res.setHeader("Retry-After", "5");
      if (status === 500)
        console.error("Request failed", {
          requestId: res.getHeader("X-Request-Id"),
          errorType: err instanceof Error ? err.name : "unknown",
        });
      res.status(status).json({ error: message });
    },
  );
  return app;
}
