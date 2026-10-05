# Ponte

Ponte helps you work out what a document is asking you to do. Upload a PDF or paste a letter, bill, notice or form, and get a plain-English explanation, a checklist, dates and costs. Each extracted detail links back to a quotation from the original text.

![Ponte document workspace](docs/images/ponte-home.png)

It is built for everyday use: checking a payment deadline, preparing for an appointment, understanding a renewal or helping someone else with paperwork. Documents are mainly expected to be in English. Other languages can be used too; explanations stay in English and quotations keep the original wording.

## Getting started

You need Node.js 22.13 or later and npm.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite serves the frontend and forwards API requests to the backend on port 3001.

If you already have a `.env` file, keep it instead of copying over it. Without an API key, you can explore three fictional example guides with prepared explanations and answers.

To analyse your own documents, add an OpenRouter key to `.env`:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=apodex/apodex-1.1-mini:free
```

Restart the app after changing these settings. Keys are used by the server and must never be committed. Free models still require an OpenRouter account and may have availability or rate limits. Ponte uses the model you configure; it does not switch to another model automatically.

An OpenAI integration is also available. Set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env` to use it.

### Running the compiled app

```bash
npm run build
npm start
```

Open [localhost:3001](http://localhost:3001), or the port set by `PORT` in `.env`. This serves the built frontend and API from the same address.

## Reading a document

Upload a PDF with selectable text, or paste the complete document. You can add context about who it is for before starting the analysis.

The results separate actions, deadlines, event dates, costs and questions that still need an answer. Use **View source** to check a quotation and its page, or **View document** to read the extracted text beside the results. You can tick completed actions, ask follow-up questions, download a text summary or print the results as a PDF.

The upload limits are **10 MB, 20 pages and 60,000 characters**. Scanned PDFs need text recognition elsewhere first: Ponte does not include OCR. A page without selectable text is reported instead of being silently skipped.

Example guides are labelled as samples. Their explanations and chat answers are prepared, so they let you explore the interface without making AI requests.

## Checking the answers

The backend divides the complete document into numbered source passages. The model selects their IDs; the server supplies the original quotation and page, so the model does not need to copy the text. Response formats, monetary amounts and calendar dates are checked too. Unsupported items get one correction attempt. Already verified items are kept; anything still unsupported is left out with a visible incomplete-analysis warning, also included in downloads and printouts. If no supported information remains, no analysis is shown. Chat answers must include verified evidence, and missing information should be reported as missing.

These checks help catch invented details, but a matching quotation does not guarantee that the explanation is right. Read the original passage before relying on a deadline, payment or instruction. Ambiguous dates keep their original wording instead of being assigned a guessed date.

The default Apodex integration uses JSON mode because its endpoint rejected strict JSON Schema requests during testing. The response is still validated on the server. Apodex uses a low reasoning effort and a 16,384-token response budget, including reasoning. If it reaches that limit, Ponte retries once with 32,768 tokens and the complete original document. Other configured OpenRouter models use strict JSON Schema requests.

## Privacy and hosting

Ponte has no accounts or database. Uploads are processed in server memory rather than saved as files, and document contents are not written to application logs. Short-lived IP counters are kept in memory to limit requests. The browser keeps the current document while you use it; session storage holds checklist progress and a non-text document identifier.

Live analysis sends document text, questions and any context you provide to OpenRouter and its selected model provider, or to OpenAI if you choose that integration. Their data policies apply. Example guides do not send anything to an AI provider.

**Clear document & start again** resets the document, chat, context and checklist in the app. It does not delete summaries you have downloaded.

Local development binds to localhost. Production adds same-origin security headers, request limits, an AI request allowance, bounded PDF workers and sanitized errors. Fonts are served locally. The server has a health endpoint and can run from a production-only dependency installation or the included container.

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting variables, HTTPS/proxy setup and the scope of the request limits. Provider usage and data settings remain part of deployment configuration. The built-in counters are per process and reset on restart.

## Development and tests

The frontend uses React, TypeScript and Vite. The backend uses Express, PDF.js for text extraction and Zod for shared response contracts.

| Directory  | Contents                                              |
| ---------- | ----------------------------------------------------- |
| `src/`     | Interface, document view, checklist, chat and export  |
| `server/`  | PDF extraction, provider adapters and evidence checks |
| `shared/`  | Schemas, date and money checks, fictional examples    |
| `tests/`   | Backend tests and desktop/mobile browser tests        |
| `scripts/` | Live provider checks and quality evaluation           |

Run the local checks with:

```bash
npm run format:check
npm run build
npm run check:release
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests start an isolated compiled server on port 3101 with empty provider credentials. They use example mode and do not call an AI provider. If you need to use an existing Chromium installation, set `PONTE_BROWSER` to its executable path. GitHub Actions runs formatting, build, backend and browser checks without provider credentials.

Live checks are separate and use the key and model in your `.env`:

```bash
npm run test:openrouter
npm run test:quality -- latest
```

The first command checks the provider integration with a fictional document. The second runs seven fixtures covering dates, costs, conditions, missing attachments and unsupported questions. Reports are written to `artifacts/quality/`, which is ignored by Git. These fixtures are useful regression checks, not a measure of accuracy on every document.

See [VALIDATION.md](VALIDATION.md) for test results and limitations, [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [CHANGELOG.md](CHANGELOG.md) for project milestones.

## License

Ponte is released under the [MIT License](LICENSE). Bundled fonts retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
