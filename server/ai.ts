import OpenAI from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { systemPrompt } from "./core";
import { RequestError } from "./errors";
import {
  buildEvidence,
  evidenceInstructions,
  hasReaderInstructions,
} from "./evidence";
import { inputSchema } from "../shared/schema";
export const OPENROUTER_MODEL = "apodex/apodex-1.1-mini:free";
export type AiConfig = {
  provider: "openrouter" | "openai";
  label: string;
  model: string;
  apiKey: string;
};
export class AiError extends RequestError {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message, status);
    this.name = "AiError";
  }
}
export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider =
    env.AI_PROVIDER ||
    (env.OPENROUTER_API_KEY
      ? "openrouter"
      : env.OPENAI_API_KEY
        ? "openai"
        : "openrouter");
  if (provider !== "openrouter" && provider !== "openai")
    throw new Error("AI_PROVIDER must be openrouter or openai.");
  return provider === "openrouter"
    ? {
        provider,
        label: "OpenRouter",
        model: env.OPENROUTER_MODEL || OPENROUTER_MODEL,
        apiKey: env.OPENROUTER_API_KEY?.trim() || "",
      }
    : {
        provider,
        label: "OpenAI",
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        apiKey: env.OPENAI_API_KEY?.trim() || "",
      };
}
export async function callStructuredModel<T>(
  schema: z.ZodType<T>,
  name: string,
  input: unknown,
  config: AiConfig,
  fetcher: typeof fetch = fetch,
  beforeRequest: () => void = () => {},
): Promise<T> {
  if (!config.apiKey)
    throw new AiError(
      `AI analysis is unavailable. Configure ${config.provider === "openrouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"} on the server or try a demo example.`,
      503,
    );
  const grounded = name === "document_analysis" || name === "document_answer";
  const evidence = grounded
    ? buildEvidence(inputSchema.parse(input).pages)
    : null;
  const responseSchema = evidence
    ? name === "document_analysis"
      ? evidence.analysis
      : evidence.answer
    : schema;
  const instructions = systemPrompt + (evidence ? evidenceInstructions : "");
  const data = evidence
    ? {
        ...(input as Record<string, unknown>),
        pages: undefined,
        source_passages: evidence.sources,
      }
    : input;
  let parsed: unknown;
  const correction =
    input !== null && typeof input === "object" && "correction" in input;
  const taskInput = {
    task:
      name === "document_answer"
        ? "Answer the document question in English. Missing information: use exactly The document does not specify this and no citations."
        : "Analyze all document pages in English. Include amounts, applicable groups, conditions, exceptions and every issue needing clarification." +
          (correction
            ? " This is a correction of your previous draft. Follow the server validation issues in data.correction. Fix unsupported quotations and monetary claims using the original pages, then return the complete corrected analysis."
            : ""),
    priority_source_ids: evidence?.sources
      .filter((s) => hasReaderInstructions(s.text))
      .map((s) => s.id),
    output_language: "English",
    source_language:
      "Preserve the original language only inside citation.quote.",
    data,
  };
  if (config.provider === "openai") {
    const client = new OpenAI({
      apiKey: config.apiKey,
      timeout: 90000,
      maxRetries: 0,
    });
    beforeRequest();
    const response = await client.responses.parse({
      model: config.model,
      store: false,
      max_output_tokens: 10000,
      instructions,
      input: [{ role: "user", content: JSON.stringify(taskInput) }],
      text: { format: zodTextFormat(responseSchema, name) },
    });
    parsed = response.output_parsed;
  } else {
    // The live Apodex endpoint supports JSON mode, despite the catalog's
    // structured-output flag. Supply the contract explicitly and validate locally.
    const format = zodResponseFormat(responseSchema, name);
    const jsonMode = config.model === OPENROUTER_MODEL;
    // Retry a truncated generation once, from the complete original input.
    // Never concatenate partial JSON or silently shorten the source document.
    let formatFeedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      beforeRequest();
      try {
        response = await fetcher(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(jsonMode ? 180000 : 90000),
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: config.model,
              messages: [
                {
                  role: "system",
                  content: jsonMode
                    ? `${instructions}\nReturn only a JSON object matching this JSON Schema. Include every required field; use empty arrays when there are no facts in a category.\n${JSON.stringify(format.json_schema.schema)}\nFinal reminder: all user-facing strings must be English, even for non-English sources. Only citation.quote keeps the source language. Do not omit missing-attachment questions or exemptions.`
                    : instructions,
                },
                {
                  role: "user",
                  content: JSON.stringify(taskInput) + formatFeedback,
                },
              ],
              response_format: jsonMode ? { type: "json_object" } : format,
              provider: { require_parameters: true },
              max_tokens: jsonMode
                ? attempt === 0
                  ? 16384
                  : 32768
                : attempt === 0
                  ? 10000
                  : 20000,
              ...(jsonMode ? { reasoning: { effort: "low" } } : {}),
              temperature: 0,
              stream: false,
            }),
          },
        );
      } catch {
        throw new AiError(
          "OpenRouter could not be reached or the request timed out. Please try again.",
        );
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new AiError(
            "OpenRouter rejected the API key or access. Check OPENROUTER_API_KEY and your account settings.",
            502,
          );
        if (response.status === 429)
          throw new AiError(
            "OpenRouter rate limit reached. Free models have usage limits. Wait a moment and try again.",
            429,
          );
        if (response.status === 402)
          throw new AiError(
            "OpenRouter requires additional account credit or an account setting change for this request.",
            502,
          );
        if (response.status === 400 || response.status === 404)
          throw new AiError(
            "OpenRouter rejected the request. Check that the exact model is available and supports structured outputs.",
            502,
          );
        throw new AiError(
          "OpenRouter or the model provider is temporarily unavailable. Try again or use a sample notice.",
        );
      }
      const envelopeSchema = z.object({
        choices: z
          .array(
            z.object({
              finish_reason: z.string().nullable().optional(),
              message: z.object({ content: z.string().nullable() }),
            }),
          )
          .min(1),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiError(
          "OpenRouter returned an unreadable response. Please try again.",
        );
      }
      const envelope = envelopeSchema.safeParse(payload);
      if (!envelope.success)
        throw new AiError(
          "OpenRouter returned an invalid or empty response. Please try again.",
        );
      const choice = envelope.data.choices[0];
      if (choice.finish_reason === "length") {
        if (attempt === 0) continue;
        throw new AiError(
          "The model could not complete its response after an automatic retry. No partial result has been shown. Please try again.",
        );
      }
      if (
        choice.finish_reason === "content_filter" ||
        choice.finish_reason === "error"
      )
        throw new AiError(
          "The model did not complete this request. Try again or use a sample notice.",
        );
      if (!choice.message.content)
        throw new AiError("The model returned no answer. Please try again.");
      try {
        parsed = JSON.parse(choice.message.content);
      } catch {
        if (attempt === 0) {
          formatFeedback =
            "\nReturn valid JSON only, with every required field. The previous response was unreadable.";
          continue;
        }
        throw new AiError(
          "The model returned invalid JSON. The result has not been shown. Please try again.",
        );
      }
      const check = responseSchema.safeParse(parsed);
      if (!check.success) {
        if (attempt === 0) {
          formatFeedback =
            "\nFix these response-format errors and return the complete JSON object: " +
            JSON.stringify(
              check.error.issues.map((i) => ({ path: i.path, code: i.code })),
            );
          continue;
        }
        throw new AiError(
          "The AI response did not match the required format after an automatic correction. Please try again.",
        );
      }
      if (evidence) {
        try {
          parsed = evidence.resolve(check.data);
        } catch {
          if (attempt === 0) {
            formatFeedback =
              "\nEach citation must select existing, consecutive source_ids from ONE page, in document order. Return the complete corrected response.";
            continue;
          }
          throw new AiError(
            "The model could not select valid source references. Please try again.",
          );
        }
      }
      break;
    }
  }
  if (config.provider === "openai" && evidence) {
    try {
      parsed = evidence.resolve(responseSchema.parse(parsed));
    } catch {
      throw new AiError(
        "The model could not select valid source references. Please try again.",
      );
    }
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success)
    throw new AiError(
      "The AI response did not match the required format. The result has not been shown. Please try again.",
    );
  return validated.data;
}
