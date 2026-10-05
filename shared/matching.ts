/** Confirms only a literal, bounded occurrence in the recipient's source text. */
export function matchesRecipient(term: string, quote: string): boolean {
  const value = term.trim();
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(quote);
}
