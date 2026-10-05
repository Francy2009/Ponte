# Validation — 3 October 2026

## Automated checks

- TypeScript and Vite build passed.
- 41 backend tests passed: model selection/JSON transport, schema and error handling, exact evidence, PDF whitespace recovery, one bounded evidence correction, blocked invalid corrections, missing-answer normalization, unsupported chat numbers/currencies, explicit missing attachments, real calendar dates, date/source agreement, ambiguity, fees and exemptions, recipient matching and PDF extraction/limits.
- 6 desktop/mobile browser tests passed: English interface, examples, checklist, sources and focus return, document view, chat, exports, reset, context, input and keyboard/errors.
- Production dependency audit previously reported zero vulnerabilities; this work added no dependencies.

## Real-model evaluation

The exact model is `apodex/apodex-1.1-mini:free`. Credentials stayed in `.env` and server memory. All requests in these tests used fictional documents. JSON mode is necessary because the upstream endpoint rejects strict JSON Schema despite the OpenRouter catalog capability flag; completed results are validated on the server.

English is the primary workload. The current suite contains six English cases and one secondary Italian translation regression. It tests conditional renewal, first-time applicants versus existing members, GBP/EUR amounts, US/UK written dates, five-page extraction with key facts on the last page, contradictory deadlines, missing attachments, hostile embedded instructions and questions, and absent answers.

The initial baseline passed 29/34 named checks on an earlier six-case suite. It exposed a shortened quotation, an omitted displayed fee and a verbose missing-answer response with irrelevant citations. A malicious instruction was rejected but unnecessarily repeated in the summary; a meeting event was also turned into a required action. These are fixture findings, not a measured general accuracy rate.

The later complete seven-case run passed five cases and blocked two analyses after evidence correction. Targeted reruns passed both blocked cases (15/15 checks). The latest verified result per case passes all 43 named checks, compiled from the full run and those targeted reruns; it is not a single failure-free run. The suite and wording evolved between baseline and final evaluation, so their totals must not be compared as an accuracy improvement percentage.

| Latest verified case                   | Language                       | Checks | Evidence       |
| -------------------------------------- | ------------------------------ | ------ | -------------- |
| Conflicting/incomplete notice          | English                        | 7/7    | final.json     |
| Hostile instructions and fee exemption | English                        | 8/8    | final.json     |
| Important facts on last page           | English                        | 7/7    | diagnosis.json |
| Conditional renewal on two pages       | English                        | 8/8    | diagnosis.json |
| Translation and exceptions             | Italian source, English output | 8/8    | final.json     |
| Supported payment question             | English                        | 3/3    | final.json     |
| Missing answer with hostile question   | English                        | 2/2    | final.json     |

Reports with fictional outputs and timings are in `artifacts/quality/`; `latest-verified.json` records the source report for each case. Run `npm run test:quality -- <label>` to reproduce with the configured provider. API limits, model nondeterminism and provider latency can change results.

A final direct test of the updated live `/api/analyze` and `/api/chat` endpoints passed using an English conditional-renewal notice: GBP 24.75 preserved, source quotations verified, and a hostile parking question answered with the exact missing-information response and no unrelated citations. Evidence is in `artifacts/quality/live-routes.json`.

## Improvements and limits

The prompt now prioritizes English output, concrete actions, displayed amounts, scope, conditions, exceptions and literal quotes. Generation uses temperature 0. Invalid evidence receives at most one correction, with server instructions kept separate from document data. A still unsupported result is blocked. The server restores PDF whitespace-only quotation changes to the exact original span, appends omitted fees only from a single unambiguous monetary value in a verified quote, preserves exempt/free cost statements, adds source-linked missing-attachment questions and rejects invalid or mismatched normalized dates. The chat clears irrelevant missing-answer citations and checks quoted evidence plus numeric/currency claims.

These checks do not prove that every paraphrase or inferred relationship is semantically correct. The model sometimes fails even after correction; rejection is preferable to presenting unsupported evidence. Whitespace recovery does not repair changed words. Date normalization supports stated English/Italian written dates and unambiguous numeric forms; unsupported formats remain unnormalized. Fee enrichment never selects between multiple different amounts. OCR and external attachment discovery are not implemented. Provider privacy policies and free-model rate limits still apply.

## Presentation polish — 5 October 2026

Removed prototype/demo labels and provider setup details from the visitor interface; example notices remain clearly marked as sample content with prepared explanations and answers. Updated summaries, print/export labels, footer and unavailable-service text. Added the Ponte favicon and basic sharing metadata.

The production build passed, as did 41 backend tests and 8 desktop/mobile browser tests. Home layouts were inspected visually. The compiled app was started locally on port 3002 for presentation, with the existing OpenRouter configuration. This is an in-person/local presentation setup; the app has not been published to a public hosting service.
