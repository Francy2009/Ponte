import type { Page } from "../shared/schema";
function whitespaceMap(text: string) {
  let normalized = "";
  const starts: number[] = [],
    ends: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = /\s/u.test(text[i]) ? " " : text[i];
    if (char === " " && normalized.endsWith(" ")) {
      ends[ends.length - 1] = i + 1;
      continue;
    }
    normalized += char;
    starts.push(i);
    ends.push(i + 1);
  }
  return { normalized, starts, ends };
}
export function recoverWhitespaceQuote(
  quote: string,
  page: Page,
): string | null {
  const needle = whitespaceMap(quote).normalized.trim();
  if (!needle) return null;
  const mapped = whitespaceMap(page.text);
  const index = mapped.normalized.indexOf(needle);
  if (index < 0) return null;
  return page.text.slice(
    mapped.starts[index],
    mapped.ends[index + needle.length - 1],
  );
}
