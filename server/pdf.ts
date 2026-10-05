import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Page } from "../shared/schema";
export async function extractPdf(buffer: Buffer): Promise<Page[]> {
  if (buffer.length === 0)
    throw new Error("The file is empty. Choose a PDF with selectable text.");
  if (buffer.length > 10 * 1024 * 1024)
    throw new Error("The PDF exceeds the 10 MB limit.");
  if (!buffer.subarray(0, 1024).toString().includes("%PDF-"))
    throw new Error("The file is not a valid PDF.");
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > 20)
      throw new Error("The PDF exceeds the 20-page limit.");
    const pages: Page[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      if (text) pages.push({ number: n, text });
      else
        throw new Error(
          `Page ${n} has no readable text: it may be scanned. OCR is not available. Paste the notice text instead.`,
        );
    }
    if (pages.reduce((n, p) => n + p.text.length, 0) > 60000)
      throw new Error("Document too long: maximum 60,000 characters.");
    return pages;
  } catch (e) {
    if (e instanceof Error && /limit|scanned|too long/.test(e.message)) throw e;
    throw new Error(
      "The PDF cannot be read. It may be corrupted or password-protected. Try pasting the text.",
    );
  } finally {
    await task.destroy();
  }
}
