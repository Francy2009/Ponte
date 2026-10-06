import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { createApp } from "../server/app";
import { serverSettings } from "../server/settings";
import { getAiConfig } from "../server/ai";

test("The Vite proxy accepts same-origin examples, chat and PDF uploads while rejecting external origins", async () => {
  const api = createApp({
    settings: serverSettings({}),
    aiConfig: getAiConfig({}),
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => api.once("listening", resolve));
  const address = api.address();
  assert.ok(address && typeof address === "object");
  const previousPort = process.env.PORT;
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    process.env.PORT = String(address.port);
    vite = await createServer({
      server: { host: "127.0.0.1", port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: "silent",
    });
    await vite.listen();
    const frontend = vite.httpServer!.address();
    assert.ok(frontend && typeof frontend === "object");
    for (const host of ["localhost", "127.0.0.1"]) {
      const base: string = `http://${host}:${frontend.port}`;
      const post = (
        path: string,
        body: unknown,
        origin: string = base,
      ): Promise<Response> =>
        fetch(base + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "Sec-Fetch-Site": "same-origin",
          },
          body: JSON.stringify(body),
        });
      assert.equal((await post("/api/demo", { id: "gita" })).status, 200);
      assert.equal(
        (
          await post("/api/chat", {
            exampleId: "gita",
            question: "What is the payment deadline?",
          })
        ).status,
        200,
      );
      const form = new FormData();
      form.append(
        "file",
        new Blob([await readFile("tests/fixtures/notice.pdf")], {
          type: "application/pdf",
        }),
        "fictional-notice.pdf",
      );
      const upload: Response = await fetch(base + "/api/extract", {
        method: "POST",
        headers: { Origin: base, "Sec-Fetch-Site": "same-origin" },
        body: form,
      });
      assert.equal(upload.status, 200);
      const document = (await upload.json()) as {
        pages: { text: string }[];
      };
      assert.match(document.pages[0].text, /November/);
      assert.equal(
        (await post("/api/demo", { id: "gita" }, "https://evil.example"))
          .status,
        403,
      );
    }
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    await vite?.close();
    api.closeAllConnections();
    await new Promise<void>((resolve) => api.close(() => resolve()));
  }
});
