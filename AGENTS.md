# Repository Guidelines

## Project Structure & Module Organization
- Source code lives in `lib/`.
  - `lib/server/` Express helpers and dev server entry (`test.cjs`).
  - `lib/generator/` content/media generation scripts.
  - `lib/web/` Handlebars templates, assets, and built files in `lib/web/dist/`.
  - `lib/utils/`, `lib/helper/`, and store modules support the above.
- Tests and scripts live in `tests/` (plus some ad‑hoc `test.*.js` files).
- Deployment helpers are in `deploy/`.
- Webpack config: `webpack.config.cjs`. App entry: `start.js`.

## Build, Test, and Development Commands
- `npm start` — Run dev server (`lib/server/test.cjs`) and watch/build assets.
- `npm run webpack:build` — Build web assets into `lib/web/dist/`.
- `npm run webpack:watch` — One build, then watch for changes.
- `npm test` — Run Jest tests in Node (`NODE_OPTIONS=--experimental-vm-modules`).
- `npm run deploy` — Build, then upload via SSH (`deploy/SSH-upload.cjs`). Requires env/SSH config.

## Coding Style & Naming Conventions
- JavaScript/Node with mixed ESM (`.mjs`/`.js`) and CommonJS (`.cjs`). Match the local module style.
- Indentation: 2 spaces; include semicolons; prefer single quotes.
- Filenames: kebab-case (e.g., `file-operations.cjs`, `media-utils.cjs`).
- Place shared helpers in `lib/utils/` or `lib/helper/` rather than duplicating logic.

## Testing Guidelines
- Framework: Jest. Put tests under `tests/` mirroring the source path.
- Naming: `*.test.js` or `*.test.cjs` so Jest discovers them by default.
- Run locally with `npm test`. Add focused tests for generators and server utilities.

## Commit & Pull Request Guidelines
- Commits: Prefer Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Keep messages imperative and scoped.
- PRs must include:
  - Summary of changes and rationale; link issues if applicable.
  - Steps to reproduce/verify (commands, sample input/output or assets under `lib/GENERATIONS/`).
  - Screenshots or result snippets when affecting web output/templates.
  - Passing `npm test` and a clean `npm run webpack:build`.

## Security & Configuration Tips
- Secrets in `.env` (example: `OPENAI_API_KEY`, `HUGGINGFACE_API_KEY`, `GOOGLE_API_KEY`, SSH creds). Do not commit `.env`.
- Validate external calls and handle API/timeouts; prefer retries where existing patterns use `axios-retry`.
- Large artifacts and generated media should not be committed unless explicitly required.


 ## CODER_SOUL style-guide
 - the ERROR is your friend! its show where you have not understand! Most there is only one solution, and this is right. Code like that, clean precisse, pure and rare.