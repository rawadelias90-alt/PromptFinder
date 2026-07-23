# Prompt Finder

Prompt Finder is a web app for finding, adapting, copying, and launching practical AI prompts. It includes a prompt library, search and category filters, prompt details, a Prompt Builder, and direct "Run in AI" actions.

## Main features

- Browse and search the approved prompt library.
- Filter prompts by category and open full prompt details.
- Copy prompts while preserving line breaks and formatting.
- Generate direct, task-specific prompts with the Prompt Builder.
- Open supported AI tools from the selected prompt, with copy-and-open fallback where required.
- Save and clear Prompt Builder drafts in the browser.

## Technology

- React 19 and Next.js 16
- Vinext and Vite
- TypeScript
- Cloudflare Worker-compatible deployment
- ESLint and Node test runner

## Folder structure

```text
app/                  User interface, prompt data, and API route
app/api/prompt-builder/  Prompt Builder endpoint
public/               Static assets
scripts/              Install, build, and artifact validation helpers
tests/                Rendered application and Prompt Builder tests
worker/               Cloudflare Worker entry point
db/ and drizzle/      Optional D1 database scaffolding
```

## Local setup

Requirements: Node.js 22.13 or later and npm.

```bash
npm ci
npm run dev
```

Open the local address shown in the terminal.

## Checks

```bash
npm run lint
npm test
```

`npm test` runs the production build, validates the deployment artifact, and runs the automated tests.

## Deployment

The production site is deployed through ChatGPT Sites. The existing lifecycle configuration is stored in `.openai/hosting.json`. Use the Sites workflow to create a validated checkpoint deployment from the current source.

## Known issues and limitations

- AI applications control whether a prompt can be prefilled. Where prefilling is not supported, Prompt Finder copies the prompt before opening the selected application.
- The Prompt Builder currently uses its server endpoint logic. A future external AI service should be connected through a server-side environment variable only; never add API keys to client-side code or this repository.
