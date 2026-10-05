import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  getAiConfig,
  callStructuredModel,
  OPENROUTER_MODEL,
} from "../server/ai";
const schema = z.object({ answer: z.string() });
const config = {
  provider: "openrouter" as const,
  label: "OpenRouter",
  model: OPENROUTER_MODEL,
  apiKey: "test-key-not-a-real-secret",
};
function mock(status: number, payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}
test("Defaults to the exact requested OpenRouter model without exposing a real key", () => {
  assert.equal(getAiConfig({}).model, "apodex/apodex-1.1-mini:free");
  assert.equal(getAiConfig({}).provider, "openrouter");
  assert.equal(getAiConfig({}).apiKey, "");
  assert.throws(() => getAiConfig({ AI_PROVIDER: "unknown" }), /AI_PROVIDER/);
});
test("Keeps OpenAI available when explicitly chosen and does not mix credentials", () => {
  const c = getAiConfig({
    AI_PROVIDER: "openrouter",
    OPENAI_API_KEY: "other-key",
  });
  assert.equal(c.apiKey, "");
  assert.equal(
    getAiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "test" }).provider,
    "openai",
  );
});
test("OpenRouter request pins Apodex, supplies its schema in JSON mode and validates output", async () => {
  const fetcher = (async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(options!.body as string);
    assert.equal(body.model, OPENROUTER_MODEL);
    assert.equal(body.models, undefined);
    assert.equal(body.response_format.type, "json_object");
    assert.match(body.messages[0].content, /JSON Schema/);
    assert.match(body.messages[0].content, /"required":\["answer"\]/);
    assert.equal(body.provider.require_parameters, true);
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /clear, respectful English/);
    const task = JSON.parse(body.messages[1].content);
    assert.equal(task.output_language, "English");
    assert.deepEqual(task.data, { text: "A fictional test" });
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"answer":"A valid result"}' },
          },
        ],
      }),
    );
  }) as typeof fetch;
  assert.deepEqual(
    await callStructuredModel(
      schema,
      "test_reply",
      { text: "A fictional test" },
      config,
      fetcher,
    ),
    { answer: "A valid result" },
  );
});
test("Missing key prevents any provider request", async () => {
  let called = false;
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      { ...config, apiKey: "" },
      (async () => {
        called = true;
        return new Response();
      }) as typeof fetch,
    ),
    /OPENROUTER_API_KEY/,
  );
  assert.equal(called, false);
});
test("Invalid JSON and invalid structured results are not accepted", async () => {
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      config,
      mock(200, {
        choices: [{ finish_reason: "stop", message: { content: "not json" } }],
      }),
    ),
    /invalid JSON/,
  );
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      config,
      mock(200, {
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"unexpected":true}' },
          },
        ],
      }),
    ),
    /required format/,
  );
});
test("Truncated replies and provider error envelopes are rejected", async () => {
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      config,
      mock(200, {
        choices: [
          {
            finish_reason: "length",
            message: { content: '{"answer":"unfinished"}' },
          },
        ],
      }),
    ),
    /response limit/,
  );
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      config,
      mock(200, { error: { message: "Private document content" } }),
    ),
    /invalid or empty/,
  );
});
test("Free-model rate limits and invalid API keys have clear, sanitized errors", async () => {
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      config,
      mock(429, { error: { message: "Private content" } }),
    ),
    /rate limit/,
  );
  await assert.rejects(
    callStructuredModel(
      schema,
      "test",
      {},
      config,
      mock(401, { error: { message: "Private content" } }),
    ),
    /API key/,
  );
});
