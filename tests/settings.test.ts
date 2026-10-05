import { test } from "node:test";
import assert from "node:assert/strict";
import { serverSettings } from "../server/settings";
import { AiBudget } from "../server/budget";

test("Production needs an explicit HTTPS origin and validates operational limits", () => {
  assert.throws(() => serverSettings({ NODE_ENV: "production" }), /APP_ORIGIN/);
  assert.throws(
    () =>
      serverSettings({
        NODE_ENV: "production",
        APP_ORIGIN: "http://example.com",
      }),
    /HTTPS/,
  );
  for (const origin of [
    "https://example.com/path",
    "https://user:secret@example.com",
    "https://example.com/?secret=value",
  ])
    assert.throws(
      () => serverSettings({ NODE_ENV: "production", APP_ORIGIN: origin }),
      /APP_ORIGIN/,
    );
  for (const env of [
    { PORT: "NaN" },
    { PORT: "99999" },
    { TRUST_PROXY: "true" },
    { AI_DAILY_REQUEST_LIMIT: "0" },
    { PDF_TIMEOUT_MS: "999999" },
  ])
    assert.throws(() => serverSettings(env));
  const config = serverSettings({
    NODE_ENV: "production",
    APP_ORIGIN: "https://example.com",
    PORT: "8080",
    TRUST_PROXY: "1",
  });
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.origin, "https://example.com");
  assert.equal(config.port, 8080);
  assert.equal(config.trustProxy, 1);
  assert.equal(serverSettings({}).host, "127.0.0.1");
});

test("AI request allowance is atomic within a process and resets at UTC midnight", () => {
  let now = Date.parse("2026-10-05T23:59:59Z");
  const budget = new AiBudget(2, () => now);
  budget.take();
  budget.take();
  assert.throws(
    () => budget.take(),
    (error: any) => error.status === 429 && /allowance/.test(error.message),
  );
  now += 1000;
  budget.take();
  budget.take();
  assert.throws(() => budget.take());
});
