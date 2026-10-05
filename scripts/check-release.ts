import { cp, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";

async function command(cmd: string, args: string[], cwd: string) {
  const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0)
    throw Error(
      `Release dependency installation failed (${code}). ${output.slice(-1200)}`,
    );
}
async function freePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => socket.once("listening", resolve));
  const address = socket.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}
function fictionalPdf() {
  const stream =
    "BT /F1 12 Tf 50 750 Td (Submit the signed form by 5 November 2026.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = text.length;
  text +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => n.toString().padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return text;
}
const root = await mkdtemp(path.join(tmpdir(), "ponte-release-check-"));
let server: ChildProcess | undefined;
let exited: Promise<number | null> | undefined;
const checks: string[] = [];
try {
  for (const name of [
    "package.json",
    "package-lock.json",
    "server",
    "shared",
    "dist",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ])
    await cp(path.resolve(name), path.join(root, name), { recursive: true });
  await command(
    "npm",
    ["ci", "--omit=dev", "--offline", "--no-audit", "--no-fund"],
    root,
  );
  checks.push("production-only dependency install");
  const port = await freePort(),
    base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      APP_ORIGIN: base,
      TRUST_PROXY: "0",
      OPENROUTER_API_KEY: "",
      OPENAI_API_KEY: "",
      AI_PROVIDER: "openrouter",
      API_RATE_LIMIT: "180",
      AI_RATE_LIMIT: "20",
      AI_DAILY_REQUEST_LIMIT: "100",
      PDF_TIMEOUT_MS: "30000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let startup = "";
  server.stdout!.on("data", (data) => (startup += data));
  server.stderr!.on("data", (data) => (startup += data));
  exited = new Promise((resolve) => server!.once("exit", resolve));
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw Error(
        "Production server exited before becoming healthy. " +
          startup.slice(-1000),
      );
    try {
      ready = (
        await fetch(base + "/api/health", { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Production server failed its health check");
  checks.push("production startup and health");
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<title>.*Ponte/);
  assert.ok(home.headers.get("content-security-policy"));
  checks.push("compiled page and CSP");
  const examples = (await (await fetch(base + "/api/examples")).json()) as {
    id: string;
  }[];
  const demo = await fetch(base + "/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ id: examples[0].id }),
  });
  assert.equal(demo.status, 200);
  checks.push("example analysis with no provider key");
  const form = new FormData();
  form.append(
    "file",
    new Blob([fictionalPdf()], { type: "application/pdf" }),
    "fictional-notice.pdf",
  );
  const upload = await fetch(base + "/api/extract", {
    method: "POST",
    headers: { Origin: base },
    body: form,
  });
  assert.equal(upload.status, 200);
  const extracted = (await upload.json()) as {
    pages: { number: number; text: string }[];
  };
  assert.match(extracted.pages[0].text, /5 November 2026/);
  checks.push("PDF worker in production install");
  assert.equal((await fetch(base + "/licenses/manrope.txt")).status, 200);
  checks.push("font license distribution");
  server.kill("SIGTERM");
  const exit = await Promise.race([
    exited,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Error("Graceful shutdown exceeded 10 seconds")),
        10000,
      ).unref(),
    ),
  ]);
  assert.equal(exit, 0);
  checks.push("graceful shutdown");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/release-check.json",
    JSON.stringify(
      { date: new Date().toISOString(), node: process.version, checks },
      null,
      2,
    ),
  );
  console.log(
    `Release check passed: ${checks.length} checks, production dependencies only, no provider credentials.`,
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGKILL");
    if (exited) await exited;
  }
  await rm(root, { recursive: true, force: true });
}
