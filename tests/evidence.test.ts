import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidence } from "../server/evidence";

test("Source catalog covers every character, retains page numbers and resolves literal references", () => {
  const pages = [
    { number: 2, text: "A source sentence with EUR 17.\n".repeat(100) },
    { number: 5, text: "The final deadline is 14 January 2027." },
  ];
  const evidence = buildEvidence(pages);
  for (const page of pages)
    assert.equal(
      evidence.sources
        .filter((s) => s.page === page.number)
        .map((s) => s.text)
        .join(""),
      page.text,
    );
  const last = evidence.sources.at(-1)!;
  assert.deepEqual(evidence.resolve({ source_ids: [last.id] }), {
    page: 5,
    quote: pages[1].text,
  });
  const first = evidence.sources.slice(0, 2);
  assert.deepEqual(evidence.resolve({ source_ids: first.map((s) => s.id) }), {
    page: 2,
    quote: first
      .map((s) => s.text)
      .join("")
      .trim(),
  });
});

test("Unknown, reordered, nonconsecutive and cross-page IDs cannot become evidence", () => {
  const evidence = buildEvidence([
    { number: 1, text: "A".repeat(3000) },
    { number: 2, text: "Final page." },
  ]);
  for (const ids of [["fake"], ["s2", "s1"], ["s1", "s3"], ["s4", "s5"]])
    assert.throws(() => evidence.resolve({ source_ids: ids }));
});

test("Grounded answer contract permits missing answers without invented evidence", () => {
  const evidence = buildEvidence([
    { number: 1, text: "No parking information." },
  ]);
  const answer = evidence.answer.parse({
    answer: "The document does not specify this",
    citations: [],
  });
  assert.deepEqual(evidence.resolve(answer), answer);
  assert.equal(
    evidence.answer.safeParse({
      answer: "Parking is free.",
      citations: [{ source_ids: ["unknown"] }],
    }).success,
    false,
  );
});
