import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../shared/examples";
import {
  analyzeWithEvidence,
  answerWithEvidence,
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
test("Unsupported items are omitted with an explicit incomplete-analysis warning; valid items survive", async () => {
  const bad = structuredClone(example.analysis);
  bad.actions[0].citation.quote = "Made up evidence";
  let calls = 0;
  const result = await analyzeWithEvidence({ pages }, async () => {
    calls++;
    return bad;
  });
  assert.ok(result.actions.every((f) => f.verified));
  assert.equal(result.actions.length, bad.actions.length - 1);
  assert.match(result.warnings![0], /incomplete/);
  assert.equal(result.costs.length, bad.costs.length);
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

test("A repair cannot discard or damage already verified facts", async () => {
  const first = structuredClone(example.analysis);
  first.actions[0].citation.quote = "Invented quote";
  const second = structuredClone(example.analysis);
  second.costs[0].text = "Pay EUR 900.";
  let calls = 0;
  const result = await analyzeWithEvidence({ pages }, async () =>
    ++calls === 1 ? first : second,
  );
  assert.ok(result.costs.every((f) => f.verified));
  assert.doesNotMatch(result.costs[0].text, /900/);
  assert.ok(result.actions.every((f) => f.verified));
  assert.equal(result.warnings, undefined);
});

test("A rate limit on correction retains supported facts with a visible warning", async () => {
  const first = structuredClone(example.analysis);
  first.actions[0].citation.quote = "Invented quote";
  let calls = 0;
  const result = await analyzeWithEvidence({ pages }, async () => {
    if (++calls === 1) return first;
    throw new AiError("rate limit", 429);
  });
  assert.equal(calls, 2);
  assert.ok(result.summary.every((f) => f.verified));
  assert.match(result.warnings![0], /actions item/);
});

test("Money claims are checked in summaries and actions as well as costs", () => {
  const raw = structuredClone(example.analysis);
  raw.summary[0].text = "Pay GBP 900.";
  assert.equal(verifyAnalysis(raw, pages).summary[0].verified, false);
});

test("Chat retries unsupported claims once without exposing the invented answer", async () => {
  let calls = 0;
  const input = { pages, question: "What is the fee?" };
  const answer = await answerWithEvidence(input, async (request) => {
    calls++;
    if (calls === 2) {
      assert.deepEqual((request as any).pages, pages);
      assert.ok((request as any).correction);
    }
    return {
      answer: calls === 1 ? "The fee is EUR 900." : "The fee is EUR 28.",
      citations: [example.analysis.costs[0].citation],
    };
  });
  assert.equal(calls, 2);
  assert.equal(answer.verified, true);
  assert.doesNotMatch(answer.answer, /900/);
});

test("Repeated unsupported chat claims remain hidden and retries are bounded", async () => {
  let calls = 0;
  const answer = await answerWithEvidence(
    { pages, question: "What is the fee?" },
    async () => {
      calls++;
      return {
        answer: "The fee is EUR 900.",
        citations: [example.analysis.costs[0].citation],
      };
    },
  );
  assert.equal(calls, 2);
  assert.equal(answer.verified, false);
  assert.doesNotMatch(answer.answer, /900/);
});

test("An entirely unsupported analysis still cannot produce a result", async () => {
  const bad = structuredClone(example.analysis);
  for (const key of [
    "summary",
    "actions",
    "recipients",
    "costs",
    "dates",
    "questions",
  ] as const)
    for (const fact of bad[key]) fact.citation.quote = "Made up";
  await assert.rejects(
    analyzeWithEvidence({ pages }, async () => bad),
    /did not return any supported information/,
  );
});

test("Reader instructions on an ignored final page trigger coverage repair", async () => {
  const source = [
    { number: 1, text: "Background information about the centre." },
    {
      number: 5,
      text: "Submit the signed form by 14 January 2027. The fee is EUR 17.",
    },
  ];
  const first = {
    title: "Centre notice",
    summary: [
      {
        text: "The notice describes the centre.",
        detail: "",
        citation: { page: 1, quote: source[0].text },
      },
    ],
    actions: [],
    costs: [],
    dates: [],
    recipients: [],
    questions: [],
  };
  const second = structuredClone(first);
  second.costs.push({
    text: "The fee is EUR 17.",
    detail: "",
    citation: { page: 5, quote: source[1].text },
  } as never);
  let calls = 0;
  const result = await analyzeWithEvidence(
    { pages: source },
    async (request) => {
      if (++calls === 1) return first;
      assert.ok(
        (request as any).correction.issues.some(
          (i: any) => i.category === "coverage" && i.index === 5,
        ),
      );
      return second;
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.costs[0].sourcePage, 5);
  assert.equal(result.warnings, undefined);
});

test("Unresolved page coverage is disclosed instead of appearing complete", async () => {
  const source = [
    { number: 1, text: "Background information." },
    { number: 5, text: "The fee is EUR 17." },
  ];
  const first = {
    title: "Centre notice",
    summary: [
      {
        text: "Background information.",
        detail: "",
        citation: { page: 1, quote: source[0].text },
      },
    ],
    actions: [],
    costs: [],
    dates: [],
    recipients: [],
    questions: [],
  };
  const result = await analyzeWithEvidence(
    { pages: source },
    async () => first,
  );
  assert.match(result.warnings![0], /page 5/);
});

test("Normalized dates contradicting their quotation are treated as unsupported", () => {
  const raw = structuredClone(example.analysis);
  raw.dates[0].iso = "2099-01-01";
  assert.equal(
    verifyAnalysis(raw, pages).dates.find((d) => d.text === raw.dates[0].text)
      ?.verified,
    false,
  );
});

test("Copied Italian details receive an English correction while original quotations stay unchanged", async () => {
  const source = [
    {
      number: 1,
      text: "I nuovi partecipanti devono consegnare il modulo firmato.",
    },
  ];
  const first = {
    title: "Participation form",
    summary: [
      {
        text: "Submit the signed form.",
        detail: source[0].text,
        citation: { page: 1, quote: source[0].text },
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
    return calls === 1
      ? first
      : {
          ...first,
          summary: [
            {
              ...first.summary[0],
              detail: "New participants must submit the signed form.",
            },
          ],
        };
  });
  assert.equal(calls, 2);
  assert.equal(result.summary[0].citation.quote, source[0].text);
  assert.doesNotMatch(result.summary[0].detail, /devono|firmato/);
});
