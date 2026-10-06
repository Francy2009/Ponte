# Changelog

## Unreleased

### Local testing

- Preserve the browser Host through Vite so localhost uploads, examples and chat pass origin validation.
- Cover local proxy requests and external-origin rejection with an integration regression.
- Add `npm run local` and explicit hackathon testing instructions for the compiled app.

### Document workspace

- English interface for everyday notices, letters, bills, appointments and forms.
- Selectable-text PDF extraction and pasted-text input.
- Plain-English explanations, recipient context, actionable checklists, dates, costs and clarification questions.
- Source quotations, original-document view, document questions, text export and print layout.
- Responsive desktop/mobile experience and sample notices with prepared explanations.

### Model integration and quality

- OpenRouter integration with `apodex/apodex-1.1-mini:free`, plus optional OpenAI support.
- Server-only credentials, structured validation and sanitized provider failures.
- Calendar-date/source matching, monetary evidence checks, PDF whitespace recovery and one bounded evidence correction.
- Clarification for explicitly missing attachments and grounded missing-answer handling.
- Backend/browser regressions and a reproducible live quality suite, mainly using English notices.

### Presentation and repository preparation

- Presentation copy, favicon and sharing metadata.
- Git exclusions for credentials, runtime data and generated outputs.
- Locked dependencies, contributor instructions and GitHub build/test automation.
- MIT license and bundled third-party notices.

### Deployment preparation

- Production configuration validation, same-origin checks, security headers and a health endpoint.
- Per-client request limits, bounded PDF/model concurrency and a daily provider-request budget.
- Isolated PDF workers with memory and time limits; worker startup does not inherit the TypeScript loader.
- Locally hosted fonts, immutable asset caching and visitor-friendly network errors.
- A non-root container image, clean production-install smoke check and deployment instructions.
- Production-mode desktop/mobile browser tests, upload regressions and dependency auditing in CI.

## Development milestones

- **3 October 2026:** document workspace, general-audience English design, model integration and quality improvements.
- **5 October 2026:** presentation polish and preparation of the first Git repository.

These milestones describe work completed in the workspace. The initial Git history groups the current source into thematic commits; it does not recreate historical snapshots or backdate commits. No GitHub release has been published.
