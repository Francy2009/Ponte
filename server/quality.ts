import { z } from "zod";
import { type Analysis, type Page, citationSchema } from "../shared/schema";
import { verifyAnalysis, verifyFact } from "./core";
import { AiError } from "./ai";
import { moneyClaimsSupported } from "../shared/money";
export const answerSchema = z.object({
  answer: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe(
      'Brief English answer proven by citations, or exactly "The document does not specify this".',
    ),
  citations: z
    .array(citationSchema)
    .max(12)
    .describe(
      "Directly relevant exact quotations. Empty when the answer is missing.",
    ),
});
export type Answer = z.infer<typeof answerSchema>;
export const MISSING_ANSWER = "The document does not specify this";
const categories = [
  "summary",
  "recipients",
  "actions",
  "dates",
  "costs",
  "questions",
] as const;
export async function analyzeWithEvidence(
  input: { pages: Page[]; role?: string; audience?: string },
  generate: (input: unknown) => Promise<Analysis>,
) {
  let raw = await generate(input);
  let result = verifyAnalysis(raw, input.pages);
  const failures = () =>
    categories.flatMap((k) =>
      result[k].flatMap((f, i) =>
        f.verified
          ? []
          : [
              {
                category: k,
                index: i,
                reason:
                  "The quotation or the stated monetary amount is not supported by the source on its stated page.",
              },
            ],
      ),
    );
  const issues = failures();
  if (issues.length) {
    raw = await generate({
      ...input,
      previous_analysis: raw,
      correction: {
        instruction:
          "Correct every unsupported quotation by copying a real contiguous passage from the original pages. Do not invent evidence or drop supported obligations, fees, deadlines or exceptions to hide the issue. Return the complete corrected analysis.",
        issues,
      },
    });
    result = verifyAnalysis(raw, input.pages);
    if (failures().length)
      throw new AiError(
        "The analysis could not be verified against the original document. No result has been shown. Please try again.",
      );
  }
  // Carry explicit missing-attachment evidence into the clarification section,
  // even when the model mentions it only in its summary.
  for (const page of input.pages) {
    const pattern =
      /\b((?:attachment|appendix|annex)\s+[a-z0-9-]+)\s+(?:is|was|has been)\s+(?:not included|missing|omitted|not attached)\b[^.!?\n]*[.!?]?/gi;
    for (const match of page.text.matchAll(pattern)) {
      const name = match[1];
      if (
        result.questions.some((f) =>
          (f.text + " " + f.detail).toLowerCase().includes(name.toLowerCase()),
        )
      )
        continue;
      result.questions.push(
        verifyFact(
          {
            text: `Where can I obtain ${name}?`,
            detail: `The notice says ${name} is not included.`,
            citation: { quote: match[0], page: page.number },
          },
          input.pages,
        ),
      );
    }
  }
  return result;
}
function numbers(text: string): string[] {
  const withoutDateSeparators = text.replace(
    /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g,
    "$1 $2 $3",
  );
  return (withoutDateSeparators.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => {
    if (n.includes(",") && n.includes(".")) {
      const decimal = n.lastIndexOf(",") > n.lastIndexOf(".") ? "," : ".";
      const grouping = decimal === "," ? "." : ",";
      n = n.split(grouping).join("").replace(decimal, ".");
    } else if (/^\d{1,3}(?:,\d{3})+$/.test(n)) {
      n = n.replaceAll(",", "");
    } else {
      n = n.replace(",", ".");
    }
    return String(Number(n));
  });
}
export function verifyAnswer(answer: Answer, pages: Page[]) {
  // Models sometimes add irrelevant citations after the missing-answer sentence.
  if (
    /^The document does not specify this(?:[.!]|$)/i.test(answer.answer.trim())
  )
    return { answer: MISSING_ANSWER, citations: [], verified: true };
  const citations = answer.citations.map((c) =>
    verifyFact({ text: "Reference", detail: "", citation: c }, pages),
  );
  const evidenceNumbers = new Set(
    citations.flatMap((c) => numbers(c.citation.quote)),
  );
  const grounded =
    citations.length > 0 &&
    citations.every((c) => c.verified) &&
    moneyClaimsSupported(
      answer.answer,
      citations.map((c) => c.citation.quote).join("\n"),
    ) &&
    numbers(answer.answer).every((n) => evidenceNumbers.has(n));
  return {
    answer: grounded
      ? answer.answer
      : "Unverified answer: the references do not support this response. Check the original source.",
    citations,
    verified: grounded,
  };
}
