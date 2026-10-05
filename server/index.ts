import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import OpenAI from "openai";
import { getAiConfig, callStructuredModel, AiError } from "./ai";
import { z } from "zod";
import { analysisSchema, inputSchema } from "../shared/schema";
import { examples } from "../shared/examples";
import { verifyAnalysis, demoAnswer } from "./core";
import { analyzeWithEvidence, answerSchema, verifyAnswer } from "./quality";
import { extractPdf } from "./pdf";
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "1mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const aiConfig = getAiConfig();
let active = 0;
async function model<T>(schema: z.ZodType<T>, name: string, input: unknown) {
  if (active >= 3)
    throw new AiError("The service is busy. Please try again shortly.", 429);
  active++;
  try {
    return await callStructuredModel(schema, name, input, aiConfig);
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
app.post("/api/extract", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new Error("Choose a PDF.");
    res.json({ pages: await extractPdf(req.file.buffer) });
  } catch (e) {
    next(e);
  }
});
app.post("/api/demo", async (req, res, next) => {
  try {
    const id = z.string().parse(req.body.id);
    const example = examples.find((e) => e.id === id);
    if (!example) throw new Error("Example unavailable.");
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
      if (!example) throw new Error("Example unavailable.");
      pages = [{ number: 1, text: example.text }];
      answer = demoAnswer(question, example.analysis);
    } else {
      const input = inputSchema.parse(req.body);
      pages = input.pages;
      answer = await model(answerSchema, "document_answer", {
        ...input,
        question,
        rule: "If the answer is not in the source, answer must be The document does not specify this and citations must be empty. Include exact source quotations for every factual answer.",
      });
    }
    res.json(verifyAnswer(answer, pages));
  } catch (e) {
    next(e);
  }
});
app.use(express.static(path.resolve("dist")));
app.get("/{*splat}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Endpoint unavailable." });
    return;
  }
  res.sendFile(path.resolve("dist/index.html"));
});
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    let message = "Unable to process the request. Please try again.";
    let status = 400;
    if (err instanceof multer.MulterError)
      message =
        err.code === "LIMIT_FILE_SIZE"
          ? "The PDF exceeds the 10 MB limit."
          : "Upload only one PDF.";
    else if (err instanceof z.ZodError)
      message = "Invalid input. Check the document text and size limits.";
    else if (err instanceof AiError) {
      message = err.message;
      status = err.status;
    } else if (err instanceof OpenAI.APIError) {
      message =
        "The AI provider is unavailable or the configuration is invalid. Try again or use a demo example.";
      status = 502;
    } else if (err instanceof Error) message = err.message;
    res.status(status).json({ error: message });
  },
);
app.listen(Number(process.env.PORT) || 3001, "127.0.0.1", () =>
  console.info("Ponte backend ready on port " + (process.env.PORT || 3001)),
);
