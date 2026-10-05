# Contributing to Ponte

Use Node.js 22.13 or later. Install the locked dependencies with `npm ci`, copy `.env.example` to `.env`, and start the workspace with `npm run dev`.

Keep explanations in English and source quotations in their original language. Preserve recipients, conditions, exemptions and the distinction between events and deadlines. All document facts must remain linked to their source.

Before proposing a change, run:

```bash
npm run format:check
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The normal test suite requires no API key. Live model checks (`npm run test:openrouter` and `npm run test:quality -- <label>`) are optional and use fictional fixtures. They consume provider quota and are not part of CI.

Use small, focused commits and describe the resulting behavior and relevant validation in pull requests. Include tests for changes to evidence validation or document interpretation. Do not include credentials, private documents, local screenshots, generated quality reports or dependency/build directories. Keep `package-lock.json` when changing dependencies.
