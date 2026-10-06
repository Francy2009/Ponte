# Validation

## Deployment verification — 5 October 2026

The current release preparation passes 69 backend tests, TypeScript/Vite compilation, formatting and 14 production-mode browser tests across desktop and mobile. The browser suite covers the document workflow, source views, chat, incomplete-analysis warnings, exports, keyboard controls, real PDF uploads, the content security policy and locally served fonts. Browser tests run without provider credentials. `npm audit` reports zero vulnerabilities at all severities for the locked dependency tree at the time of this check.

`npm run check:release` passes seven checks in a clean temporary copy installed with production dependencies only: startup/health, compiled page and CSP, prepared examples, PDF worker extraction, font license distribution and graceful shutdown, plus dependency installation. Test credentials are explicitly empty, and the copy excludes `.env`, Git history and generated test reports.

The container image is built in Docker format using Node 22.23.3. It runs as UID 1000. Its runtime excludes credentials, Git metadata, test artifacts and Vite. The runtime smoke check uses a read-only root filesystem, a temporary `/tmp`, dropped Linux capabilities, no provider key, and a 512 MB memory limit. The first container check found that inherited TypeScript loader hooks could exhaust the PDF worker's heap; the worker now starts as native JavaScript. The corrected image passes five HTTP checks, including the same real PDF upload, and its container health check. Local backend and production-install checks were rerun after the fix.

Production settings reject missing/invalid origins and out-of-range limits. HTTP integration tests cover cross-site writes, malformed/oversized requests, forwarded-header spoofing, rate limits, the daily provider budget, concurrent uploads, safe error responses, asset caching and restricted static files. `/api/health` checks application availability, not upstream model availability.

After restarting the final local build on port 3002, direct `/api/analyze` and `/api/chat` requests passed with `apodex/apodex-1.1-mini:free` and a fictional English renewal notice. The EUR 28 fee was retained, all displayed analysis items had verified literal source quotations, and the payment answer had verified citations. The ignored report is `artifacts/quality/release-live-routes.json`. This is an endpoint smoke check, not a rerun of the full live quality suite.

These checks establish the tested local deployment behavior. Publishing still requires a hosting service, HTTPS, the configured origin and server-side provider credentials. Request budgets are per process and reset on restart; the deployment guide describes their scope and provider account spending controls. Live-model evaluations below remain separate from these infrastructure checks and do not guarantee accuracy on arbitrary documents.

## Earlier verification — 3 October 2026

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

## Evidence-reference update

Live analysis and chat now select numbered source passages instead of generating quotation text. The server resolves those IDs to literal original spans and page numbers. Unknown, nonconsecutive, reordered and cross-page references are rejected. All original text remains in the passage catalog.

Response-format errors receive one bounded correction. Evidence correction retains the first draft's already verified facts. Remaining unsupported items are omitted with an explicit incomplete-analysis warning in the interface, downloaded summary and printed view. Empty sections of an incomplete analysis ask the reader to check the original instead of claiming that information is absent. Monetary claims are checked across all analysis categories. Earlier results above describe the previous pipeline and do not establish live-model quality for this update.

The page-coverage check requests a correction when a page containing possible reader instructions or costs has no verified result item. A remaining coverage gap produces an incomplete-analysis warning. This is a heuristic for omissions, not a guarantee that every obligation is captured. Chat has one bounded evidence correction, and contradictory normalized dates are treated as unsupported rather than merely losing their sort date. Copied Italian prose in displayed fields also receives an English correction; source quotations remain in their original language.

Browser tests use a separate compiled server on port 3101 with empty provider credentials, avoiding changes to an existing development session.

For the evidence-reference pipeline, the first complete seven-case live run passed 37/43 checks. It exposed a missed final page and untranslated Italian details. After adding coverage and language corrections, the two affected cases passed 15/15 checks in a targeted live rerun (`evidence-final-review.json`). The five other cases passed in the complete run; these are separate runs, not a single 43/43 run of the final implementation. Reports contain fictional test data and are kept in the ignored `artifacts/quality/` directory.

Final local checks passed: backend tests, TypeScript/build and formatting; all 10 desktop/mobile browser tests, followed by both targeted incomplete-analysis tests after the last wording/style changes. A direct live check of the restarted `/api/analyze` and `/api/chat` endpoints also passed with a fictional English notice: the EUR 28 fee was retained and both responses had verified source evidence (`artifacts/quality/evidence-live-routes.json`).

## Localhost upload regression — 6 October 2026

Vite's string-form proxy rewrote the Host header to the backend address while keeping the browser Origin. This caused local PDF uploads, examples and chat to fail the same-origin check with HTTP 403. The proxy now explicitly preserves Host with `changeOrigin: false`; the backend's origin protection is unchanged.

A regression test starts the real Vite proxy and API on temporary ports, checks examples, prepared chat and a real PDF upload from both localhost and 127.0.0.1, and confirms that an external origin is rejected. All 70 automated tests, TypeScript/build, formatting, the seven production-install smoke checks and 14 production-mode desktop/mobile browser tests passed. PDF uploads also passed in Chromium against the running local development app on both hostnames.

The new `npm run local` command builds and starts the compiled app. It was checked after an offline locked dependency installation in a clean temporary source copy without `.env` or provider credentials: startup, page, API configuration and a prepared example passed. The README distinguishes development mode on port 5173 from the compiled app on port 3001 by default. Live analysis of user documents still requires the tester's own provider key.
