import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { getAiConfig, callStructuredModel } from "../server/ai";
import { analysisSchema } from "../shared/schema";
import {
  analyzeWithEvidence,
  answerSchema,
  verifyAnswer,
} from "../server/quality";
import { fixtures, chatFixtures, type Check } from "../tests/quality/fixtures";

const config = getAiConfig();
if (config.provider !== "openrouter" || !config.apiKey)
  throw Error("Configure OpenRouter in .env first.");
const label = process.argv[2] || "latest";
if (!/^[a-z0-9-]+$/.test(label)) throw Error("Use a simple report label.");
const report: {
  model: string;
  date: string;
  cases: {
    id: string;
    durationMs: number;
    checks: Check[];
    error?: string;
    output?: unknown;
  }[];
} = { model: config.model, date: new Date().toISOString(), cases: [] };
const selected = [...fixtures, ...chatFixtures].filter(
  (f) => !process.argv[3] || process.argv[3].split(",").includes(f.id),
);
if (!selected.length)
  throw Error("No quality cases matched the requested IDs.");
for (const fixture of selected) {
  console.info(`Testing ${fixture.id}…`);
  const start = Date.now();
  const entry: (typeof report.cases)[number] = {
    id: fixture.id,
    durationMs: 0,
    checks: [],
  };
  const drafts: unknown[] = [];
  try {
    if ("checks" in fixture) {
      const a = await analyzeWithEvidence(
        { pages: fixture.pages, role: "myself", audience: "" },
        async (request) => {
          const draft = await callStructuredModel(
            analysisSchema,
            "document_analysis",
            request,
            config,
          );
          drafts.push(draft);
          return draft;
        },
      );
      entry.output = a;
      entry.checks = [
        { name: "nonempty-summary", passed: a.summary.length > 0 },
        {
          name: "all-quotations-exact",
          passed: [
            ...a.summary,
            ...a.actions,
            ...a.dates,
            ...a.recipients,
            ...a.costs,
            ...a.questions,
          ].every((f) => f.verified),
        },
        ...fixture.checks(a),
      ];
    } else {
      const raw = await callStructuredModel(
        answerSchema,
        "document_answer",
        { pages: fixture.pages, question: fixture.question },
        config,
      );
      const answer = verifyAnswer(raw, fixture.pages);
      entry.output = answer;
      entry.checks = [
        {
          name: "expected-answer",
          passed: fixture.expected.test(answer.answer.trim()),
        },
        {
          name: "correct-evidence",
          passed:
            answer.verified &&
            (fixture.missing
              ? answer.citations.length === 0
              : answer.citations.length > 0 &&
                answer.citations.every((c) => c.verified)),
        },
        ...("date" in fixture && fixture.date
          ? [{ name: "payment-date", passed: fixture.date.test(answer.answer) }]
          : []),
      ];
    }
  } catch (error) {
    entry.output = { drafts };
    entry.error = error instanceof Error ? error.message : "Evaluation failed";
    entry.checks = [{ name: "completed-and-valid-schema", passed: false }];
  }
  entry.durationMs = Date.now() - start;
  report.cases.push(entry);
  const failed = entry.checks.filter((c) => !c.passed).map((c) => c.name);
  console.info(
    `${entry.id}: ${failed.length ? "FAIL: " + failed.join(", ") : "PASS"} (${Math.round(entry.durationMs / 1000)} s)`,
  );
  await mkdir("artifacts/quality", { recursive: true });
  await writeFile(
    `artifacts/quality/${label}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  // Avoid repeatedly hitting an account limit; preserve completed test evidence.
  if (entry.error?.includes("rate limit")) break;
}
const passed = report.cases
  .flatMap((c) => c.checks)
  .filter((c) => c.passed).length;
const total = report.cases.flatMap((c) => c.checks).length;
console.info(
  `${passed}/${total} checks passed across ${report.cases.length}/${selected.length} cases. Report contains fictional data only.`,
);
if (report.cases.length !== selected.length || passed !== total)
  process.exitCode = 1;
