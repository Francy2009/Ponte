import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app";
import { serverSettings } from "../server/settings";
import { getAiConfig } from "../server/ai";
import { examples } from "../shared/examples";

async function withApp(
  options: Parameters<typeof createApp>[0],
  run: (base: string) => Promise<void>,
) {
  const app = createApp({
    settings: serverSettings({}),
    aiConfig: getAiConfig({}),
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const source = { pages: [{ number: 1, text: "The fee is EUR 28." }] };
const payload = {
  title: "Fee notice",
  summary: [
    {
      text: "The fee is EUR 28.",
      detail: "",
      citation: { source_ids: ["s1"] },
    },
  ],
  costs: [{ text: "EUR 28", detail: "", citation: { source_ids: ["s1"] } }],
  actions: [],
  dates: [],
  questions: [],
  recipients: [],
};
const fake = async () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(payload) },
        },
      ],
    }),
  );

test("API input errors are useful and never echo uploaded text or parser errors", async () =>
  withApp({}, async (base) => {
    const invalid = await fetch(base + "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"private-doc": secret',
    });
    assert.equal(invalid.status, 400);
    assert.doesNotMatch(await invalid.text(), /private-doc|secret|SyntaxError/);
    const oversized = await fetch(
      base + "/api/analyze",
      json({ text: "sensitive ".repeat(40000) }),
    );
    assert.equal(oversized.status, 413);
    assert.doesNotMatch(await oversized.text(), /sensitive/);
    const missing = await fetch(base + "/api/chat", { method: "POST" });
    assert.equal(missing.status, 415);
    const duplicate = await fetch(
      base + "/api/analyze",
      json({ pages: [...source.pages, ...source.pages] }),
    );
    assert.equal(duplicate.status, 400);
    assert.equal((await fetch(base + "/api/unknown", json({}))).status, 404);
  }));

test("Cross-site mutations are rejected before calling the provider", async () => {
  let calls = 0;
  await withApp(
    {
      settings: serverSettings({ APP_ORIGIN: "https://ponte.example" }),
      fetcher: (async () => {
        calls++;
        return fake();
      }) as typeof fetch,
    },
    async (base) => {
      const res = await fetch(
        base + "/api/analyze",
        json(source, { Origin: "https://evil.example" }),
      );
      assert.equal(res.status, 403);
      assert.equal(
        (
          await fetch(
            base + "/api/analyze",
            json(source, { "Sec-Fetch-Site": "cross-site" }),
          )
        ).status,
        403,
      );
      assert.equal(calls, 0);
    },
  );
});

test("Spoofed forwarding headers cannot bypass the default IP limit; health stays available", async () =>
  withApp(
    { settings: { ...serverSettings({}), apiLimit: 2 } },
    async (base) => {
      for (let i = 1; i <= 2; i++)
        assert.equal(
          (
            await fetch(base + "/api/examples", {
              headers: { "X-Forwarded-For": `192.0.2.${i}` },
            })
          ).status,
          200,
        );
      const limited = await fetch(base + "/api/examples", {
        headers: { "X-Forwarded-For": "192.0.2.99" },
      });
      assert.equal(limited.status, 429);
      assert.ok(limited.headers.get("retry-after"));
      assert.equal((await fetch(base + "/api/health")).status, 200);
    },
  ));

test("Daily AI allowance prevents a second provider call while example guides keep working", async () => {
  let calls = 0;
  await withApp(
    {
      settings: { ...serverSettings({}), aiDailyLimit: 1 },
      aiConfig: getAiConfig({ OPENROUTER_API_KEY: "fictional-test-key" }),
      fetcher: (async () => {
        calls++;
        return fake();
      }) as typeof fetch,
    },
    async (base) => {
      const first = await fetch(base + "/api/analyze", json(source));
      assert.equal(first.status, 200);
      const limited = await fetch(base + "/api/analyze", json(source));
      assert.equal(limited.status, 429);
      assert.equal(calls, 1);
      assert.equal(
        (await fetch(base + "/api/demo", json({ id: examples[0].id })))
          .status === 429,
        false,
      );
    },
  );
});

test("Production headers, immutable assets and dotfile protection apply to the compiled site", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ponte-static-test-"));
  try {
    await mkdir(path.join(root, "assets"));
    await writeFile(
      path.join(root, "index.html"),
      "<!doctype html><title>Ponte</title>",
    );
    await writeFile(path.join(root, "assets/test.js"), "console.log('test')");
    await writeFile(path.join(root, ".env"), "TEST_PRIVATE_KEY=do-not-show");
    await withApp(
      {
        settings: serverSettings({
          NODE_ENV: "production",
          APP_ORIGIN: "https://ponte.example",
        }),
        distPath: root,
      },
      async (base) => {
        const home = await fetch(base);
        assert.equal(home.status, 200);
        assert.match(
          home.headers.get("content-security-policy")!,
          /script-src 'self'/,
        );
        assert.doesNotMatch(
          home.headers.get("content-security-policy")!,
          /unsafe-eval|googleapis/,
        );
        assert.equal(home.headers.get("x-powered-by"), null);
        assert.equal(home.headers.get("referrer-policy"), "no-referrer");
        assert.ok(home.headers.get("strict-transport-security"));
        const asset = await fetch(base + "/assets/test.js");
        assert.match(asset.headers.get("cache-control")!, /immutable/);
        const secret = await fetch(base + "/.env");
        assert.ok([403, 404].includes(secret.status));
        assert.doesNotMatch(await secret.text(), /PRIVATE_KEY|do-not-show/);
        assert.equal((await fetch(base + "/server/index.ts")).status, 404);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function upload() {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-fictional"]), "notice.pdf");
  return { method: "POST", body: form };
}

test("Unexpected PDF reader errors are sanitized without exposing file contents", async () =>
  withApp(
    {
      readPdf: async () => {
        throw Error("private document contents");
      },
    },
    async (base) => {
      const res = await fetch(base + "/api/extract", upload());
      assert.equal(res.status, 500);
      assert.doesNotMatch(await res.text(), /private document contents/);
      assert.ok(res.headers.get("x-request-id"));
    },
  ));

test("Concurrent upload admission is bounded before accepting another PDF", async () => {
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => (arrived = resolve));
  const releases: (() => void)[] = [];
  await withApp(
    {
      readPdf: async () => {
        await new Promise<void>((resolve) => {
          releases.push(resolve);
          if (releases.length === 2) arrived();
        });
        return [{ number: 1, text: "Readable text." }];
      },
    },
    async (base) => {
      const first = fetch(base + "/api/extract", upload());
      const second = fetch(base + "/api/extract", upload());
      await ready;
      const busy = await fetch(base + "/api/extract", upload());
      assert.equal(busy.status, 503);
      releases.forEach((release) => release());
      assert.equal((await first).status, 200);
      assert.equal((await second).status, 200);
    },
  );
});
