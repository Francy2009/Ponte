import { test } from "node:test";
import assert from "node:assert/strict";
import { monetaryAmounts, clarifyCost } from "../shared/money";
const cost = (quote: string, text = "Access fee") => ({
  text,
  detail: "",
  citation: { quote },
  verified: true,
});
test("An omitted unambiguous amount is displayed verbatim from its verified source", () => {
  const f = clarifyCost(
    cost("The one-time access fee is EUR 17, payable by 16 January 2027."),
  );
  assert.equal(f.text, "Access fee — EUR 17");
  assert.equal(f.verified, true);
  assert.equal(
    clarifyCost(cost("The course costs 35 euro.")).text,
    "Access fee — 35 euro",
  );
});
test("Money matching handles English thousands and decimal formats", () => {
  assert.equal(monetaryAmounts("GBP 1,200.50")[0].key, "gbp:1200.5");
  assert.equal(monetaryAmounts("EUR 1.200,50")[0].key, "eur:1200.5");
  assert.equal(monetaryAmounts("48.50 euros")[0].key, "eur:48.5");
  assert.equal(
    clarifyCost(cost("The fee is GBP 1,200.50.", "Pay £1200.50")).verified,
    true,
  );
});
test("Wrong amounts or currencies fail verification despite a real quotation", () => {
  assert.equal(
    clarifyCost(cost("The fee is EUR 17.", "Pay EUR 900")).verified,
    false,
  );
  assert.equal(
    clarifyCost(cost("The fee is EUR 17.", "Pay GBP 17")).verified,
    false,
  );
  assert.equal(
    clarifyCost({ ...cost("The fee is EUR 17."), verified: false }).text,
    "Access fee",
  );
});
test("Multiple amounts are never collapsed into an assumed fee", () => {
  assert.equal(
    clarifyCost(cost("Adults pay EUR 17 and children pay EUR 9.")).text,
    "Access fee",
  );
  assert.equal(
    clarifyCost(cost("Registered volunteers attend free.")).text,
    "Access fee",
  );
});
test("An exemption is not given another group's fee from a broad quotation", () => {
  const f = clarifyCost(
    cost(
      "Members pay EUR 17. Volunteers attend free.",
      "Volunteers are exempt",
    ),
  );
  assert.equal(f.text, "Volunteers are exempt");
});
test("Dollar notation may be generic but never invents a specific dollar currency", () => {
  assert.equal(
    clarifyCost(cost("The fee is USD 12.", "Pay $12")).verified,
    true,
  );
  assert.equal(
    clarifyCost(cost("The fee is $12.", "Pay USD 12")).verified,
    false,
  );
});
