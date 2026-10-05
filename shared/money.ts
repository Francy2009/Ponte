const codes = "EUR|GBP|USD|CAD|AUD|NZD|CHF|INR";
const number = "\\d+(?:[.,]\\d+)*";
export function monetaryAmounts(text: string) {
  const pattern = new RegExp(
    `(?:(\\b(?:${codes})\\b|[€£$])\\s*(${number})|(${number})\\s*(\\b(?:${codes}|euros?|pounds?|dollars?)\\b))`,
    "gi",
  );
  return Array.from(text.matchAll(pattern), (m) => {
    let amount = m[2] || m[3];
    if (amount.includes(",") && amount.includes(".")) {
      const decimal =
        amount.lastIndexOf(",") > amount.lastIndexOf(".") ? "," : ".";
      amount = amount
        .split(decimal === "," ? "." : ",")
        .join("")
        .replace(decimal, ".");
    } else if (/^\d{1,3}(?:,\d{3})+$/.test(amount))
      amount = amount.replaceAll(",", "");
    else amount = amount.replace(",", ".");
    const rawCurrency = (m[1] || m[4]).toLowerCase();
    const currency = /^(eur|€|euros?)$/.test(rawCurrency)
      ? "eur"
      : /^(gbp|£|pounds?)$/.test(rawCurrency)
        ? "gbp"
        : /^(\$|dollars?)$/.test(rawCurrency)
          ? "dollar"
          : rawCurrency;
    return { raw: m[0], key: currency + ":" + Number(amount) };
  });
}
export function moneyClaimsSupported(
  displayedText: string,
  sourceText: string,
): boolean {
  const supported = new Set(monetaryAmounts(sourceText).map((m) => m.key));
  return monetaryAmounts(displayedText).every((m) => {
    if (supported.has(m.key)) return true;
    if (m.key.startsWith("dollar:")) {
      const value = m.key.slice("dollar:".length);
      return ["usd", "cad", "aud", "nzd"].some((currency) =>
        supported.has(currency + ":" + value),
      );
    }
    return false;
  });
}
export function clarifyCost<
  T extends {
    text: string;
    detail: string;
    citation: { quote: string };
    verified: boolean;
  },
>(fact: T): T {
  if (!fact.verified) return fact;
  const quoted = monetaryAmounts(fact.citation.quote);
  const displayed = monetaryAmounts(fact.text + " " + fact.detail);
  const supported = new Set(quoted.map((m) => m.key));
  if (!moneyClaimsSupported(fact.text + " " + fact.detail, fact.citation.quote))
    return { ...fact, verified: false };
  if (
    !displayed.length &&
    supported.size === 1 &&
    !/\b(?:free|exempt|waived|no charge|no fee|not pay)\b/i.test(
      fact.text + " " + fact.detail,
    )
  )
    return { ...fact, text: fact.text + " — " + quoted[0].raw };
  return fact;
}
