import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../shared/examples";
import {
  analyzeWithEvidence,
  verifyAnswer,
  MISSING_ANSWER,
} from "../server/quality";
import { verifyAnalysis, verifyFact } from "../server/core";
import { AiError } from "../server/ai";
const example = examples[0];
const pages = [{ number: 1, text: example.text }];
test("A nonliteral quote receives one correction request retaining the original pages", async () => {
  const bad = structuredClone(example.analysis);
  bad.costs[0].citation.quote = "Fee ... 28";
  let calls = 0;
  const result = await analyzeWithEvidence({ pages }, async (input) => {
    calls++;
    if (calls === 1) return bad;
    assert.deepEqual((input as any).pages, pages);
    assert.ok((input as any).correction.issues.length > 0);
    return example.analysis;
  });
  assert.equal(calls, 2);
  assert.ok(result.costs.every((f) => f.verified));
});
test("Unsupported quotations after the single correction are blocked, not silently removed", async () => {
  const bad = structuredClone(example.analysis);
  bad.actions[0].citation.quote = "Made up evidence";
  let calls = 0;
  await assert.rejects(
    analyzeWithEvidence({ pages }, async () => {
      calls++;
      return bad;
    }),
    /could not be verified/,
  );
  assert.equal(calls, 2);
});
test("Valid evidence uses a single request and rate limits are not retried", async () => {
  let calls = 0;
  await analyzeWithEvidence({ pages }, async () => {
    calls++;
    return example.analysis;
  });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    analyzeWithEvidence({ pages }, async () => {
      calls++;
      throw new AiError("rate limit", 429);
    }),
    /rate limit/,
  );
  assert.equal(calls, 1);
});
test("Missing answers are normalized and unrelated references are cleared", () => {
  const a = verifyAnswer(
    {
      answer:
        "The document does not specify this. The notice discusses membership.",
      citations: [example.analysis.costs[0].citation],
    },
    pages,
  );
  assert.equal(a.answer, MISSING_ANSWER);
  assert.deepEqual(a.citations, []);
  assert.equal(a.verified, true);
});
test("Chat rejects a fabricated number even with a real quotation", () => {
  const a = verifyAnswer(
    {
      answer: "The fee is EUR 900.",
      citations: [example.analysis.costs[0].citation],
    },
    pages,
  );
  assert.equal(a.verified, false);
  assert.doesNotMatch(a.answer, /900/);
  const good = verifyAnswer(
    {
      answer: "The fee is EUR 28.",
      citations: [example.analysis.costs[0].citation],
    },
    pages,
  );
  assert.equal(good.verified, true);
  assert.equal(
    verifyAnswer({ answer: "Parking is free.", citations: [] }, pages).verified,
    false,
  );
});
test("Invalid or mismatched calendar dates cannot become ordered deadlines", () => {
  const raw = structuredClone(example.analysis);
  raw.dates[0].iso = "2026-11-09";
  raw.dates[1].iso = "2026-11-31";
  const a = verifyAnalysis(raw, pages);
  assert.equal(a.dates.find((d) => d.text === raw.dates[0].text)?.iso, null);
  assert.equal(a.dates.find((d) => d.text === raw.dates[1].text)?.iso, null);
});
test("English thousands and decimal currency formatting remain supported", () => {
  const source = [
    { number: 1, text: "The fee is GBP 1,200.50, payable by 14.12.2026." },
  ];
  const citations = [{ page: 1, quote: source[0].text }];
  assert.equal(
    verifyAnswer(
      { answer: "Pay GBP 1200.50 by 14 December 2026.", citations },
      source,
    ).verified,
    true,
  );
  assert.equal(
    verifyAnswer(
      { answer: "Pay GBP 1200.51 by 14 December 2026.", citations },
      source,
    ).verified,
    false,
  );
});
test("Explicitly missing attachments become clarification items without another AI call", async () => {
  const source = [{ number: 1, text: "Attachment A is not included." }];
  const raw = {
    title: "Missing form",
    summary: [
      {
        text: "Attachment A is missing.",
        detail: "",
        citation: { quote: source[0].text, page: 1 },
      },
    ],
    actions: [],
    dates: [],
    costs: [],
    recipients: [],
    questions: [],
  };
  let calls = 0;
  const result = await analyzeWithEvidence({ pages: source }, async () => {
    calls++;
    return raw;
  });
  assert.equal(calls, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].verified, true);
  assert.match(result.questions[0].text, /Attachment A/);
});
test("Chat rejects the wrong currency even when the numerical amount matches", () => {
  const a = verifyAnswer(
    { answer: "Pay GBP 28.", citations: [example.analysis.costs[0].citation] },
    pages,
  );
  assert.equal(a.verified, false);
});
test("PDF whitespace is recovered as an exact original quote, without changing words", () => {
  const source = [{ number: 2, text: "Pay EUR\u00a017 by\n14 January 2027." }];
  const raw = {
    text: "Pay the fee.",
    detail: "",
    citation: { page: 2, quote: "Pay EUR 17 by 14 January 2027." },
  };
  const f = verifyFact(raw, source);
  assert.equal(f.verified, true);
  assert.equal(f.citation.quote, source[0].text);
  assert.equal(
    verifyFact(
      {
        ...raw,
        citation: { ...raw.citation, quote: "Pay EUR 19 by 14 January 2027." },
      },
      source,
    ).verified,
    false,
  );
  assert.equal(
    verifyFact({ ...raw, citation: { ...raw.citation, page: 1 } }, source)
      .verified,
    false,
  );
});
