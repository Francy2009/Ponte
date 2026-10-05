import { z } from "zod";
export const pageSchema = z.object({
  number: z.number().int().min(1),
  text: z.string().trim().min(1).max(60000),
});
export type Page = z.infer<typeof pageSchema>;
export const citationSchema = z.object({
  quote: z.string().trim().min(1).max(5000),
  page: z.number().int().min(1).nullable(),
});
export const factSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(3000)
    .describe(
      "Concise English fact or action. For a cost, include its amount and currency.",
    ),
  detail: z
    .string()
    .max(2000)
    .describe(
      "English supporting details and exceptions, only from the cited quotation. For a date, the readable date.",
    ),
  citation: citationSchema,
});
export const actionSchema = factSchema.extend({
  who: z
    .string()
    .max(1000)
    .describe(
      "Only the applicable group and conditions stated in the source; empty if unstated.",
    ),
  deadline: z
    .string()
    .max(500)
    .describe(
      "The action's actual deadline, not an unrelated event date. Empty if unstated.",
    ),
  prerequisites: z
    .string()
    .max(1000)
    .describe(
      "Only explicit things needed to perform the action. Empty if unstated.",
    ),
  optional: z
    .boolean()
    .describe(
      "True only if this individual action can be skipped while still participating. False for conditional requirements of people choosing to participate.",
    ),
});
export const dateSchema = factSchema.extend({
  kind: z.enum(["event", "deadline", "unclear"]),
  iso: z.string().nullable(),
});
export const analysisSchema = z.object({
  title: z.string().min(1).max(200).describe("A short neutral English title."),
  summary: z.array(factSchema).min(1).max(12),
  recipients: z.array(factSchema).max(20),
  actions: z.array(actionSchema).max(30),
  dates: z.array(dateSchema).max(30),
  costs: z.array(factSchema).max(20),
  questions: z.array(factSchema).max(20),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type Fact = z.infer<typeof factSchema>;
export type VerifiedFact = Fact & {
  verified: boolean;
  context: string;
  sourcePage: number | null;
};
export type VerifiedAnalysis = Omit<
  Analysis,
  "summary" | "recipients" | "actions" | "dates" | "costs" | "questions"
> & {
  [
    K in "summary" | "recipients" | "actions" | "dates" | "costs" | "questions"
  ]: (Analysis[K][number] & VerifiedFact)[];
};
export type Result = {
  analysis: VerifiedAnalysis;
  pages: Page[];
  mode: "demo" | "ai";
  exampleId?: string;
  name: string;
};
export const inputSchema = z
  .object({
    pages: z.array(pageSchema).min(1).max(20),
    role: z.enum(["", "myself", "someone_else"]).default(""),
    audience: z.string().max(40).default(""),
  })
  .refine(
    (x) => x.pages.reduce((n, p) => n + p.text.length, 0) <= 60000,
    "Document too long (maximum 60,000 characters).",
  );
