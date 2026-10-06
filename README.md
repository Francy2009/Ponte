# Ponte

Ponte is for those letters and forms that sit on the table while you try to work out what they actually want from you. You upload a PDF or paste the text, and it answers in plain English: what to do, by when, and what it might cost. Every detail points back to a quotation in the original, so you can check it yourself.

![Ponte document workspace](docs/images/ponte-home.png)

It is meant for ordinary paperwork: a bill, a renewal, a notice about an appointment, or helping someone else through the same pile. English documents work best. Other languages can go in too. Explanations stay in English; quotations keep the original wording.

## Getting started

You need Node.js 22.13 or later, and npm.

```bash
npm ci
cp .env.example .env
npm run dev
```

Run the `cp` step only if you do not already have a `.env` file. Keep your existing configuration otherwise. Then open [localhost:5173](http://localhost:5173). Vite runs the interface and sends API requests to the backend on port 3001.

With no API key you can still click through three fictional sample guides. Their explanations and chat answers are prepared, so nothing is sent to a model.

To analyse a real document, put an OpenRouter key in `.env`:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=apodex/apodex-1.1-mini:free
```

Restart after you change these. The key stays on the server. Do not commit it. The free model still needs an OpenRouter account, and it can be slow or unavailable. Ponte uses the model you set and will not quietly pick another one.

OpenAI works as well. Set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`.

To run the compiled app:

```bash
npm run build
npm start
```

Then open [localhost:3001](http://localhost:3001), or whichever port you put in `PORT`. The built interface and the API share that address.

## Reading a document

Upload a PDF that already has selectable text, or paste the whole document. Before you start you can say who it is for, if that helps.

You get actions, deadlines, event dates, costs, and questions that still need an answer. **View source** shows the quotation and its page. **View document** puts the extracted text next to the results. You can tick things off, ask follow-up questions, download a text summary, or print a PDF.

Uploads can be up to 10 MB, 20 pages, and 60,000 characters. Ponte does not do OCR, so a scanned page needs text recognition somewhere else first. If a page has no selectable text, it says so instead of skipping it.

Sample guides are labelled as samples.

## Checking the answers

The server splits the document into numbered passages. The model picks IDs; the server fills in the real quotation and page, so the model does not have to copy the wording. Formats, money, and calendar dates are checked as well. Something that does not hold up gets one correction try. What already checked out is kept. What still does not is dropped, and you see an incomplete analysis warning (the same warning goes into downloads and printouts). If nothing solid is left, no analysis is shown. Chat answers need verified evidence. Missing information should stay missing.

A matching quotation is not the same as a correct explanation. Read the original before you trust a deadline, a payment, or an instruction. Ambiguous dates keep the original wording. Ponte will not invent a calendar date to fill the gap.

The default Apodex setup uses JSON mode because, during testing, that endpoint refused strict JSON Schema. The server still validates the reply. Apodex runs with low reasoning effort and a 16,384 token budget (reasoning included). If it hits that limit, Ponte tries once more with 32,768 tokens and the full original document. Other OpenRouter models you configure get strict JSON Schema.

## Privacy and hosting

There are no accounts and no database. Uploads live in server memory for the request and are not saved as files. Document text is not written to application logs. Short-lived counters per IP limit incoming requests. The browser holds the current document while you work. Session storage keeps checklist ticks and an identifier that is not the document text.

A live analysis sends the document, your questions, and any context you typed to OpenRouter (and the model behind it), or to OpenAI if you chose that. Their policies apply. Sample guides do not send anything.

**Clear document & start again** wipes the document, chat, context, and checklist in the app. Downloaded summaries stay on your computer.

Locally it binds to localhost. In production you get same origin headers, request limits, a daily allowance for model calls, bounded PDF workers, and errors that do not leak internals. Fonts come from the app itself. There is a health endpoint. You can run from a production-only install or from the container in the repo.

[DEPLOYMENT.md](DEPLOYMENT.md) covers hosting variables, HTTPS, proxies, and what the limits actually do. They are per process and reset on restart. How the provider uses the data is still something you set on their side.

## Development and tests

The interface is React, TypeScript, and Vite. The server is Express, with PDF.js for extraction and Zod for the shared shapes.

`src/` is the interface (document view, checklist, chat, export). `server/` handles PDFs, providers, and evidence. `shared/` has schemas, date and money checks, and the fictional examples. `tests/` has backend tests and desktop/mobile browser tests. `scripts/` is for live provider checks and quality runs.

```bash
npm run format:check
npm run build
npm run check:release
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests start a compiled server of their own on port 3101, with provider keys emptied. They stay in example mode and do not call a model. If Chromium is already on the machine, point `PONTE_BROWSER` at it. GitHub Actions runs formatting, the build, backend tests, and the browser tests without credentials.

Live checks use the key and model in your `.env`:

```bash
npm run test:openrouter
npm run test:quality -- latest
```

The first one hits the provider with a fictional document. The second runs seven fixtures (dates, costs, conditions, missing attachments, questions with no answer). Reports land in `artifacts/quality/`, which Git ignores. They are regression checks, not a score for every document you might upload.

[VALIDATION.md](VALIDATION.md) has results and limits. [CONTRIBUTING.md](CONTRIBUTING.md) is the working rhythm. [CHANGELOG.md](CHANGELOG.md) is the project history.

## License

MIT, in [LICENSE](LICENSE). The bundled fonts have their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
