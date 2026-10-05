import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const task = getDocument({
  data: workerData,
  useSystemFonts: true,
  isEvalSupported: false,
  verbosity: 0,
});
let result;
try {
  const doc = await task.promise;
  if (doc.numPages > 20) throw Error("pages");
  const pages = [];
  let characters = 0;
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) =>
        "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
      )
      .join("")
      .trim();
    if (!text) {
      result = { error: "scanned", page: number };
      break;
    }
    characters += text.length;
    if (characters > 60000) throw Error("characters");
    pages.push({ number, text });
    page.cleanup();
  }
  if (!result) result = { pages };
} catch (error) {
  result = {
    error:
      error?.message === "pages"
        ? "pages"
        : error?.message === "characters"
          ? "characters"
          : "unreadable",
  };
} finally {
  await task.destroy();
}
parentPort.postMessage(result);
