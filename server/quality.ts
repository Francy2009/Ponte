import { z } from "zod";
import { type Analysis, type Page, citationSchema } from "../shared/schema";
import { verifyAnalysis, verifyFact } from "./core";
import { AiError } from "./ai";
import { hasReaderInstructions } from "./evidence";
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
function hasUntranslatedWording(fact: {
  text: string;
  detail: string;
  who?: string;
  deadline?: string;
  prerequisites?: string;
}) {
  // Catch copied Italian prose in English output; quotations are intentionally
  // excluded. Proper names such as Via Tiglio remain allowed.
  return /\b(?:devono|entro|consegnare|firmato|comunale|facoltativo|iscritti|residenti|partecipanti|portare)\b/i.test(
    [fact.text, fact.detail, fact.who, fact.deadline, fact.prerequisites].join(
      " ",
    ),
  );
}
export async function analyzeWithEvidence(
  input: { pages: Page[]; role?: string; audience?: string },
  generate: (input: unknown) => Promise<Analysis>,
) {
  let raw = await generate(input);
  let result = verifyAnalysis(raw, input.pages);
  const failures = () =>
    categories.flatMap((k) =>
      result[k].flatMap((f, i) =>
        f.verified && !hasUntranslatedWording(f)
          ? []
          : [
              {
                category: k,
                index: i,
                reason: hasUntranslatedWording(f)
                  ? "Translate every displayed field into English. Preserve proper names and keep source-language text only inside citations. Do not copy source prose into detail, who or prerequisites."
                  : "The quotation or the stated monetary amount is not supported by the source on its stated page.",
              },
            ],
      ),
    );
  const uncovered = input.pages.filter(
    (page) =>
      hasReaderInstructions(page.text) &&
      !categories.some((key) =>
        result[key].some(
          (fact) => fact.verified && fact.sourcePage === page.number,
        ),
      ),
  );
  const issues = [
    ...failures(),
    ...uncovered.map((page) => ({
      category: "coverage",
      index: page.number,
      reason:
        "This page contains possible reader instructions or costs but no verified item refers to it. Read this page and include its applicable obligations, fees, dates, conditions and exceptions.",
    })),
  ];
  if (issues.length) {
    const first = result;
    let corrected: typeof result | undefined;
    try {
      raw = await generate({
        ...input,
        previous_analysis: raw,
        correction: {
          instruction:
            "Repair only the listed items. Keep every category's item order and all already-supported items unchanged. Each replacement must be proven by its selected source passages. Preserve supported obligations, fees, deadlines, conditions and exceptions. Return the complete corrected analysis.",
          issues,
        },
      });
      corrected = verifyAnalysis(raw, input.pages);
    } catch (error) {
      // A second provider failure must not discard the verified first draft.
      if (!(error instanceof AiError)) throw error;
    }
    // Coverage repair can add facts on previously ignored pages. Preserve the
    // valid initial facts while accepting verified additions from those pages.
    if (corrected && uncovered.length) {
      for (const key of categories) {
        const additions = corrected[key].filter(
          (f) => f.verified && uncovered.some((p) => p.number === f.sourcePage),
        );
        (first[key] as unknown) = [...first[key], ...additions];
      }
    }
    const omitted: string[] = [];
    for (const key of categories) {
      let missing = 0;
      const items = first[key].flatMap((fact, index) => {
        if (fact.verified && !hasUntranslatedWording(fact)) return [fact];
        const repair = corrected?.[key][index];
        if (repair?.verified && !hasUntranslatedWording(repair))
          return [repair];
        missing++;
        return [];
      });
      (result[key] as unknown) = items;
      if (missing)
        omitted.push(`${missing} ${key} item${missing === 1 ? "" : "s"}`);
    }
    const missingPages = uncovered.filter(
      (page) =>
        !categories.some((key) =>
          result[key].some((f) => f.verified && f.sourcePage === page.number),
        ),
    );
    if (missingPages.length)
      omitted.push(
        `information from page${missingPages.length === 1 ? "" : "s"} ${missingPages.map((p) => p.number).join(", ")}`,
      );
    if (omitted.length) {
      result.warnings = [
        `This analysis is incomplete. ${omitted.join(", ")} could not be checked against the source and were left out. Review the original document for obligations, dates and costs before relying on the checklist.`,
      ];
    }
    if (!result.summary.length) {
      const supported = categories
        .flatMap((key) => result[key])
        .find((f) => f.verified);
      if (!supported)
        throw new AiError(
          "The model did not return any supported information. Your document is still available; please try again.",
        );
      result.summary = [
        {
          text: supported.text,
          detail: supported.detail,
          citation: supported.citation,
          verified: true,
          sourcePage: supported.sourcePage,
          context: supported.context,
        },
      ];
    }
  }
  result.dates.sort((a, b) => (a.iso ?? "9999").localeCompare(b.iso ?? "9999"));
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

export async function answerWithEvidence(
  input: { pages: Page[]; question: string; role?: string; audience?: string },
  generate: (input: unknown) => Promise<Answer>,
) {
  const first = verifyAnswer(await generate(input), input.pages);
  if (first.verified) return first;
  try {
    const corrected = await generate({
      ...input,
      correction: {
        instruction:
          "The previous answer was not supported by its source references or included unsupported numbers or currencies. Answer only from directly relevant source passages. Preserve the original amounts, dates, currencies and conditions. If the information is missing, answer exactly The document does not specify this with citations [].",
      },
    });
    return verifyAnswer(corrected, input.pages);
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    return first;
  }
}
