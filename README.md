# Ponte

**Everyday documents. Clear next steps.**

Ponte primarily reads English notices, letters, bills, forms, appointment messages and administrative documents for anyone. Other source languages can also be used, with English explanations and original-language quotations. It turns formal or scattered information into a plain-English explanation, a checklist, dates, costs and questions to clarify. Every extracted item includes a quotation that can be checked against the original document.

![Ponte document workspace](docs/images/ponte-home.png)

- Understand key information in plain English.
- Keep actions, fees, deadlines and event dates separate.
- Check every extracted detail against the original quotation.
- Ask about the notice, track completed actions and export a summary.

## Run locally

Requires Node.js 22.13 or later and npm.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. The backend runs on `127.0.0.1:3001`; Vite proxies `/api` requests. To run the production build locally:

```bash
npm run build
npm start
```

Open **http://localhost:3001**.

## Example guides and document analysis

**Example guides work without credentials.** Three clearly labelled fictional documents demonstrate payment and form deadlines, appointment booking, and missing information. Results and chat responses are prepared, not live AI analysis. Quotations are genuinely checked by the backend. PDF upload and extraction work, but uploaded documents cannot be analysed without an AI connection. The primary demo button explicitly opens a sample; it never pretends to analyse an upload.

**OpenRouter is the default AI provider**, with this default model:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=apodex/apodex-1.1-mini:free
```

Insert your key in the local `.env` file, never in frontend code or public commits, and restart `npm run dev`. An OpenRouter API key and account access are still required for a free model. The model is pinned; Ponte does not silently select a paid model or a different model. Free endpoints may be rate limited or unavailable.

The backend pins the requested model and uses `provider.require_parameters: true`. The live Apodex endpoint rejects `json_schema` and supports `json_object`, so Ponte uses JSON mode with the full schema supplied in the system prompt. It then validates the response with Zod and verifies quotations on the server. Other configured OpenRouter models use strict JSON schema requests. Invalid JSON, incomplete output, missing schema fields and provider errors do not produce a fabricated result. Errors explain invalid access, rate limits, connectivity and format failures without exposing provider payloads or document contents.

OpenRouter lists this model with support for structured outputs in its [official model page](https://openrouter.ai/apodex/apodex-1.1-mini:free). The integration follows the [OpenRouter quickstart](https://openrouter.ai/docs/quickstart) and [structured output documentation](https://openrouter.ai/docs/guides/features/structured-outputs). The live endpoint was checked with the configured key: its JSON Schema rejection differs from the catalog capability flag. JSON mode does not enforce the schema during generation; server validation still rejects incomplete or malformed results.

OpenAI is also available by setting `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`. It uses Responses API with structured output. Keys always remain on the server. English explanations and answers are requested regardless of the document language; quotations retain the original language.

### Live OpenRouter check

After adding your key, run `npm run test:openrouter`. This makes two real requests using a fictional document only, checking quotation presence, payment and start dates, the fee, an embedded hostile instruction and an unanswered question. A passing check is a smoke test, not a general quality or prompt-injection guarantee. It prints status, not your key or document contents.

## Using Ponte

1. Upload a PDF with selectable text, or paste the complete document.
2. Optionally say whether you are reading for yourself or someone else and specify a recipient or group. A recipient match is confirmed only if the exact term occurs in a verified source quotation; other matches remain undetermined.
3. Run AI analysis, or explore a fictional sample in example mode.
4. Use the at-a-glance cards and section links to find the explanation, checklist, earliest dated deadline, costs and questions to clarify.
5. Select **View source** to see an exact quote, page and surrounding context. **View document** displays the extracted original text alongside the results on desktop.
6. Tick completed actions, ask questions, download a text summary with all source quotations or use **Print / PDF** for a printable view.
7. **Clear document & start again** clears the document, chat, profile context and checklist from the app.

Limits: **10 MB, 20 pages and 60,000 characters**. Empty, corrupted, password-protected and unsupported files are rejected. OCR is not implemented. A PDF page without selectable text causes an explicit error rather than a silently incomplete analysis.

## Architecture

- `src/main.tsx`: React application, upload flow, results, checklist, chat and export.
- `src/components.tsx`: stable source and fact components, including keyboard focus restoration.
- `src/style.css`: responsive design, visible focus, large readable text and print styles.
- `server/index.ts`: Express endpoints for PDF extraction, demo, AI analysis and chat.
- `server/pdf.ts`: PDF.js extraction with original page numbers.
- `server/core.ts`: quotation, monetary amount and calendar-date verification, untrusted-document prompt and demo chat rules.
- `server/quality.ts`: one bounded correction for unsupported evidence, missing-attachment clarification and grounded chat replies.
- `server/ai.ts`: configurable OpenRouter / OpenAI adapters, pinned model, strict output validation and sanitized provider errors.
- `shared/schema.ts`: shared Zod contracts and TypeScript types.
- `shared/dates.ts`, `shared/money.ts`: deterministic calendar and monetary evidence checks.
- `shared/examples.ts`: three fictional English documents and prepared analyses.
- `examples/`: downloadable fictional documents.
- `tests/`: backend and desktop/mobile browser tests.

No database or registration is required. No documents are stored as server files.

## Grounding and limitations

Every analysis item must carry an exact, contiguous quotation. If the model flattens PDF line wrapping, the server may locate the passage using whitespace normalization and return the exact original span; word changes and ellipses still fail verification. The server checks it against the stated page, or locates the page if none is stated. AI analysis with unsupported quotations or monetary amounts receives one correction request using the original document; if verification still fails, no analysis is shown. Prepared demo items retain visible verification labels. A fee omitted from a displayed cost is appended verbatim only when its exact quotation contains one unambiguous monetary amount. Explicit English statements that an attachment is missing also produce a source-linked clarification item. Chat replies are blocked when quotations are absent or fail verification, or when numerical claims are not present in the cited passages. Missing-information replies are normalized and unrelated citations removed. Event dates and deadlines are separate; ISO dates used for ordering must be real calendar dates with day, month and year supported by the quote. Written English/Italian dates and unambiguous numeric formats are supported. Ambiguous numeric dates and unsupported formats retain the original wording but are not assigned an ISO date. Ambiguous relative dates are flagged, not guessed.

**A matching quotation does not prove that a paraphrase is correct.** The verification is textual, not a semantic guarantee. The document remains the source of truth. Prompts instruct the model to ignore instructions contained in documents and questions, preserve conditions, avoid invented information and state when an answer is missing. The model has no browsing, code execution or external-action tools. Prompt injection resistance and real-model quality still need broader evaluation beyond the fictional smoke tests.

The chat in example mode is limited to supported categories: signatures/forms, payments, dates, bookings, recipients and documents to prepare. Unrecognised questions receive **The document does not specify this**; this is not general natural-language understanding. See `VALIDATION.md` for the results and limits of the real-model smoke test. No reliability scores, statistics or testimonials are invented.

## Privacy

Documents are processed in server memory and remain in the browser during use. The application does not log document contents or write uploads to disk. SessionStorage contains only checklist indices and a non-text document identifier. Clearing the document removes application state; it does not erase downloads or promise secure memory deletion.

In OpenRouter mode, document text, questions and optional context are sent to **OpenRouter and the model provider selected by OpenRouter**. Their retention and data policies apply; Ponte does not promise zero retention or local inference. In the optional OpenAI mode, calls use `store: false`, which also does not promise that the provider retains no data. The interface explains this before analysis. Example notices do not send data to an AI provider.

The current installation is for local use and in-person presentations. A public service needs HTTPS, client rate limiting, spending controls, PDF extraction timeouts and privacy review. AI requests are limited to three concurrent calls and inputs are bounded, but public-service protection is not complete.

## Tests

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests start the server automatically or reuse an existing instance. Browser tests override the public configuration response to exercise demo mode, even when a key is configured; they do not send documents to the AI provider. Set `PONTE_BROWSER` to an existing Chromium executable if needed. Desktop tests use a 1440-pixel viewport; mobile tests use 390 pixels. Screenshots are saved in `artifacts/`.

## Quality evaluation

```bash
npm run test:quality -- latest
```

This runs seven live cases with the configured model: six English cases and one secondary Italian translation case. It covers multi-page notices, UK/US written dates, conditional renewal and exemptions, missing attachments, conflicting deadlines, hostile document/question instructions, important facts on the last page, precise costs and unanswered questions. Results are saved to `artifacts/quality/<label>.json` with fictional outputs and timings; no credentials or user documents are included. A third CLI argument can select comma-separated case IDs for targeted diagnosis.

The suite measures named requirements on these fixtures, not general accuracy. Successful tests do not prove semantic correctness on arbitrary documents, and retries may increase latency. The app keeps the exact configured model and does not silently select another one.

## Two-minute demonstration

- **0:00–0:20:** introduce the problem: everyday documents hide important instructions among formal text. Show the three-step flow and no-account access.
- **0:20–0:55:** open the payment example. Distinguish the form deadline (5 November), payment deadline (9 November) and start date (18 November). Tick an action.
- **0:55–1:15:** open **View source** and compare the exact quotation and page. Display the original document.
- **1:15–1:35:** ask **What is the payment deadline?**, then **Will a doctor be there?** to demonstrate a missing answer.
- **1:35–1:55:** open the incomplete example. Show the missing Attachment A, undefined “next Friday”, unknown fee and unavailable timetable.
- **1:55–2:00:** download the summary and explain that demo results are prepared; new-document AI analysis requires a server API key, configured for OpenRouter by default.

## Presentation setup

Use `npm run build` followed by `npm start`, then open `http://localhost:3001` for a presentation using the compiled application. Configure the provider in the local `.env` before starting. The interface keeps model IDs and credential setup out of the visitor flow, while explaining provider data handling in the privacy section. Examples remain clearly identified as sample notices with prepared explanations.

Internet access is required for live document analysis. This setup does not publish the application or certify it as a production service; public hosting requires the operational protections described above.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, [CHANGELOG.md](CHANGELOG.md) for the project milestones and [VALIDATION.md](VALIDATION.md) for tested behavior and its limits. GitHub Actions runs formatting, build, backend and browser checks without provider credentials. Live AI quality checks remain opt-in local commands.

The repository excludes `.env`, dependencies, build output, private/runtime data, generated screenshots and quality reports, browser sessions and editor/account settings. The empty `.env.example`, lockfile, source, fictional fixtures, tests and one curated interface image are intentionally included.
