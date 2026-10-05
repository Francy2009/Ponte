import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "./app";
import { serverSettings } from "./settings";
import { stopPdfWorkers } from "./pdf";
const settings = serverSettings();
if (settings.production && !existsSync(path.resolve("dist/index.html")))
  throw new Error(
    "Missing application build. Run npm run build before starting production.",
  );
const app = createApp({ settings });
const server = app.listen(settings.port, settings.host, () =>
  console.info(`Ponte ready on ${settings.host}:${settings.port}`),
);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.on("error", () => {
  console.error(
    "Ponte could not start. Check the host, port and whether another server is already listening.",
  );
  process.exitCode = 1;
});
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 30000);
    deadline.unref();
    server.close(() => {
      void stopPdfWorkers().finally(() => {
        clearTimeout(deadline);
        process.exit(0);
      });
    });
    server.closeIdleConnections();
  });
