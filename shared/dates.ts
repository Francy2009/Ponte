// ISO dates drive ordering and deadline cards: accept only a real calendar date
// explicitly present in its quotation. Unsupported/ambiguous formats keep null.
const monthNames = [
  ["january", "jan", "gennaio"],
  ["february", "feb", "febbraio"],
  ["march", "mar", "marzo"],
  ["april", "apr", "aprile"],
  ["may", "maggio"],
  ["june", "jun", "giugno"],
  ["july", "jul", "luglio"],
  ["august", "aug", "agosto"],
  ["september", "sep", "sept", "settembre"],
  ["october", "oct", "ottobre"],
  ["november", "nov", "novembre"],
  ["december", "dec", "dicembre"],
];
export function isCalendarDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(iso + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso
  );
}
export function supportedDate(
  iso: string | null,
  quote: string,
): string | null {
  if (!iso || !isCalendarDate(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const q = quote.toLowerCase();
  const names = monthNames[month - 1].join("|");
  const d = `0?${day}(?:st|nd|rd|th)?`;
  const textual = new RegExp(
    `\\b(?:${d}\\s+(?:${names})\\.?\\s*,?\\s*${year}|(?:${names})\\.?\\s+${d}\\s*,?\\s*${year})\\b`,
    "i",
  );
  if (textual.test(q)) return iso;
  const ymd = new RegExp(`\\b${year}[-/]0?${month}[-/]0?${day}\\b`);
  if (ymd.test(q)) return iso;
  // 04/05/2026 may mean April 5 or May 4. Never pick one automatically.
  const numeric = new RegExp(`\\b0?${day}[/.]0?${month}[/.]${year}\\b`);
  if (day > 12 && numeric.test(q)) return iso;
  const us = new RegExp(`\\b0?${month}[/]0?${day}[/]${year}\\b`);
  if (day > 12 && us.test(q)) return iso;
  return null;
}
