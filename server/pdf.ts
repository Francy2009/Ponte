import { Worker } from "node:worker_threads";
import { z } from "zod";
import { pageSchema, type Page } from "../shared/schema";
import { RequestError } from "./errors";
const workers = new Set<Worker>();
export const PDF_CONCURRENCY = 2;
export async function stopPdfWorkers() {
  await Promise.all([...workers].map((worker) => worker.terminate()));
}
export async function extractPdf(
  buffer: Buffer,
  options: { timeoutMs?: number; workerUrl?: URL } = {},
): Promise<Page[]> {
  if (buffer.length === 0)
    throw new RequestError(
      "The file is empty. Choose a PDF with selectable text.",
    );
  if (buffer.length > 10 * 1024 * 1024)
    throw new RequestError("The PDF exceeds the 10 MB limit.", 413);
  if (!buffer.subarray(0, 1024).toString().includes("%PDF-"))
    throw new RequestError("The file is not a valid PDF.");
  if (workers.size >= PDF_CONCURRENCY)
    throw new RequestError(
      "PDF processing is busy. Please try again shortly.",
      503,
    );
  const data = new Uint8Array(buffer);
  const worker = new Worker(
    options.workerUrl ?? new URL("./pdf-worker.mjs", import.meta.url),
    {
      // This worker is native JavaScript. Inheriting the TypeScript loader
      // unnecessarily transforms PDF.js and can exhaust its bounded heap.
      execArgv: [],
      workerData: data,
      transferList: [data.buffer],
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    },
  );
  workers.add(worker);
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: RequestError, pages?: Page[]) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate().finally(() => {
        workers.delete(worker);
        if (error) reject(error);
        else resolve(pages!);
      });
    };
    const timer = setTimeout(
      () =>
        finish(
          new RequestError(
            "This PDF took too long to read. Try a simpler PDF or paste its text instead.",
            504,
          ),
        ),
      options.timeoutMs ?? 30000,
    );
    worker.once("message", (result: unknown) => {
      const valid = z
        .object({ pages: z.array(pageSchema).min(1).max(20) })
        .safeParse(result);
      if (
        valid.success &&
        valid.data.pages.reduce((n, p) => n + p.text.length, 0) <= 60000
      ) {
        finish(undefined, valid.data.pages);
        return;
      }
      const failure = z
        .object({
          error: z.enum(["pages", "characters", "scanned", "unreadable"]),
          page: z.number().int().min(1).max(20).optional(),
        })
        .safeParse(result);
      const code = failure.success ? failure.data.error : "unreadable";
      const message =
        code === "pages"
          ? "The PDF exceeds the 20-page limit."
          : code === "characters"
            ? "Document too long: maximum 60,000 characters."
            : code === "scanned"
              ? `Page ${failure.success ? failure.data.page : ""} has no readable text: it may be scanned. OCR is not available. Paste the notice text instead.`
              : "The PDF cannot be read. It may be corrupted or password-protected. Try pasting the text.";
      finish(new RequestError(message));
    });
    worker.once("error", () =>
      finish(
        new RequestError(
          "This PDF could not be processed safely. Try a simpler PDF or paste its text.",
        ),
      ),
    );
    worker.once("exit", () => {
      workers.delete(worker);
      if (!finished)
        finish(
          new RequestError(
            "The PDF reader stopped unexpectedly. Try pasting the text.",
          ),
        );
    });
  });
}
