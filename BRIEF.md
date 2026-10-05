# Coil Mac app — brief

You are building this end to end in this folder. Work autonomously. Before asking any question, complete the work already authorized; record every assumption in `NOTES.md` and keep going. Commit as you go on branch `mac-app` (named paths, not `git add -A`). Finish with `VERIFICATION.md` (format at the bottom).

## Goal
Coil (this repo: a React + CodeMirror Fountain screenplay editor, deployed as a web app from the same code) also ships as a native macOS app built with Electron: the same UI, pixel for pixel, with its AI features working locally and no longer defaulting to Gemini.

## Context
- This folder is a standalone clone of `github.com:joeturnerlin/coil-writer` (branch `mac-app`, based on local `main` 2cbb4dc). The web app is deployed to Vercel from `main`; that deployment must keep working unchanged from this same code.
- Read-only sources (never modify): `/Users/joeturnerlin/CLAUDE_PROJECTS/recoil/fountain-editor` (the primary checkout; its untracked `DESIGN_SYSTEM.md`, `BUILD_SPEC.md`, `PITCH.md` describe the intended look and features — read them if useful).
- Ignore: `node_modules/`, `dist/`, `e2e/screenshots/`, `test-results/`.
- Verified facts:
  - Frontend calls relative `/api/*` paths (`src/lib/ai-provider.ts:157`, `src/lib/script-analysis.ts:224`, `src/lib/ai-dispatch.ts`). Server functions live in `api/*.ts` as Vercel Edge handlers `handler(req: Request): Response` (`api/rewrite.ts:24`); `api/rate-limit.ts` uses Upstash Redis.
  - Persistence is IndexedDB via Dexie (`src/lib/persistence.ts`); file import/export in `src/lib/file-io.ts` and `src/components/FileDropZone.tsx`.
  - Gemini is the default today: `src/store/ai-store.ts:87` (`provider: 'google', model: 'gemini-2.5-pro'`), the comparison default at `:92`, `api/analyze.ts:79` hardcodes `gemini-2.5-pro`, and `api/subtext.ts`/`api/rewrite.ts` use a server-side `GEMINI_API_KEY`. Model ids are scattered: `src/lib/ai-provider.ts:23-29`, `src/lib/script-analysis.ts:128,239`, `src/store/ai-store.ts:87-94`.
  - Current API model ids (checked in the OpenRouter catalog 2026-09-27): Anthropic `claude-fable-5-1` (catalog: anthropic/claude-fable-5.1), `claude-opus-5-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`; OpenAI `gpt-6-astra` (catalog: openai/gpt-6-astra).
  - Toolchain here: Node v24.12.0, npm, Xcode 27. No Rust.
- UNVERIFIED — do not invent; leave a TODO with the doc URL if you need them: the native OpenAI API slug for Astra if it differs from `gpt-6-astra`; whether the Anthropic Messages API needs any new header for Fable 5.1.

## Constraints
- **One codebase.** The Mac app loads the same built frontend (`vite build`) and runs the same `api/*.ts` handlers in the Electron main process (for example via `protocol.handle` or a loopback server). No forked copies of components or handlers. The Vercel web build (`npm run build`, `vercel.json`) behaves exactly as before.
- **Exactly the same UI.** No visual or behavioral changes to the editor except the AI model defaults below. Native additions only where a Mac app needs them: app menu (File > Open/Save/Save As/Export mapped to the existing file-io functions, Edit, View, Window, Help), open `.fountain` files by double-click / drag onto the Dock icon / `open -a Coil file.fountain` (registered document type), window state remembered, a Coil app icon.
- **Model SSOT.** Create ONE module that is the only place model ids and default providers live (e.g. `src/lib/models.ts`), imported by both `src/` and `api/`. Defaults: rewrite and analysis on `claude-fable-5-1` (Anthropic); comparison pair `claude-fable-5-1` vs `gpt-6-astra`. The model picker lists current models only (the ids above). Gemini may stay selectable when the user has entered a Google key, but no default and no server path falls back to Gemini, and `api/analyze.ts` must take its model from the SSOT, not a literal. After you finish, `grep -rn "gemini-\|claude-\|gpt-" src api --include=*.ts --include=*.tsx` must show ids only in that one module (tests excepted).
- **Keys.** Keep the existing user-entered API keys (Settings). In the Mac app, keys never leave the machine except to the provider's API. Rate limiting (Upstash) is a web-deploy concern: in the Mac app it must no-op cleanly without Redis env vars, without changing web behavior.
- **Electron security.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer; a minimal preload exposing only what the menus/file-open need; no remote content loaded; external links open in the default browser.
- **Simplicity.** Minimum code that does this. Prefer Electron built-ins and one packager (`electron-builder` or Electron Forge — pick one, justify in NOTES.md). No new state library, no framework swaps, no speculative settings.
- Out of scope: pushing, deploying, code signing/notarization with Apple IDs (an ad-hoc/unsigned local build is fine), auto-update.

## Autonomy
Bias toward action and carry this to completion. `npm install`, builds, unit tests, Playwright (web and `_electron`) runs, and packaging have no external effects — run, fix and rerun them without asking. Anything that spends money or touches a shared system — real AI provider calls, `git push`, `vercel`, installing into `/Applications` — do not do it; write the exact command in NOTES.md instead. AI features are verified with mocked provider responses only.
Verification: headless where possible; Playwright's `_electron.launch` is allowed to open app windows on this Mac for screenshots.

## Look / quality bar
A professional Mac app that feels native at the edges (menus, file open, window behavior, icon) and is indistinguishable from the web app inside the window. Clean, small diff; every changed line traces to this brief.

## DONE WHEN
1. `scripts/verify.sh` exits 0 and runs: `npm run check`, `npm test`, `npm run build` (web), the Mac package build, and a Playwright suite that launches the packaged/built Electron app.
2. Parity: the Electron suite screenshots the editor with the same fixture script as the web build at the same window size and saves both to `verification/parity/` (web.png, mac.png, plus a pixel-diff result under a stated threshold). Also a screenshot with the File menu wiring exercised (open a `.fountain` fixture through the main-process open path, not the drop zone).
3. Opening `tests/fixtures/*.fountain` (add one if none) via the app's open-file handler shows the script in the editor (asserted in the Electron suite).
4. AI features: with a mocked provider, Rewrite and Analyze succeed in the Electron app through the local `api/*` handlers, and the requested model is `claude-fable-5-1` by default (asserted).
5. The model-id grep above shows ids only in the SSOT module.
6. A `.app` exists under `release/` (or the packager's output dir) and its `Info.plist` declares the `.fountain` document type.
7. `VERIFICATION.md` contains real pasted output (Ran / Path / Not verified).
Do not stop after the first passing milestone if any item above is still open. Stop and report only when all are true or you are genuinely blocked — then write `BLOCKED.md` with the exact error and the command that reproduces it.

```
VERIFICATION
✓ Ran: <exact commands you executed and the result — paste the real output tail>
✓ Path: <the live code path you exercised — not a fallback, not a unit in isolation>
⚠ Not verified: <what you did NOT test>
```
