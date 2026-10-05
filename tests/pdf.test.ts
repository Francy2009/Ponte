import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdf } from "../server/pdf";
function pdf(text: string | null) {
  const stream =
    text === null ? "" : "BT /F1 12 Tf 50 750 Td (" + text + ") Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(value.length);
    value += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = value.length;
  value +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((o) => o.toString().padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}
test("Extracts selectable text and preserves page number", async () => {
  const pages = await extractPdf(pdf("Submit by 5 November 2026."));
  assert.equal(pages[0].number, 1);
  assert.match(pages[0].text, /Submit by 5 November 2026/);
});
test("PDF without text states OCR is unavailable and does not simulate reading", async () => {
  await assert.rejects(extractPdf(pdf(null)), /scanned.*OCR is not available/);
});
test("Oversized PDF rejected before reading", async () => {
  await assert.rejects(extractPdf(Buffer.alloc(10 * 1024 * 1024 + 1)), /10 MB/);
});
