# Implementation notes

BRIEF.md is the approved design. Work stays in this standalone mac-app checkout; the initial unrelated .gitignore addition is preserved. The stale finance scratchpad is unrelated to this assignment.

The renderer owns editor state and existing IndexedDB/localStorage persistence. src/lib/models.ts owns model IDs and defaults. Electron owns the native document path, OS dialogs, window bounds, and menus. The same built frontend runs at coil://app; protocol.handle sends /api requests to the existing handlers in the main process. Errors return through the existing UI or native error dialogs. Deleting the shell leaves the web app intact.

Use electron-builder with its directory target: one packager, native file associations, and an inspectable local .app without distribution or notarization. Bundle main/preload with esbuild; sandboxed preload exposes document actions only, never arbitrary IPC, paths, network, or Node access.

Analysis is actually a Node-style Vercel function, despite the brief's general Edge-handler description. Preserve its default Node export and maxDuration; expose the shared Request/Response implementation for Electron. Desktop bundles disable Upstash and environment key fallbacks at build time. User keys stay in existing Settings storage and go only to provider APIs through the main process.

The current frontend loads Google Fonts remotely. Bundle those same font assets and licenses, using identical CSS for web and desktop. No component styling redesign. The optional Gemini picker entries are removed; existing Google keys are retained, while retired selections migrate to the approved defaults.

TODO: Confirm the native OpenAI Astra slug against https://platform.openai.com/docs/models before a paid call; use the brief's gpt-6-astra meanwhile. TODO: Confirm any Fable-specific Anthropic header at https://docs.anthropic.com/en/api/messages before a paid call; retain the existing documented anthropic-version header. No real provider calls are authorized or needed for this build.

Implementation sequence: model SSOT and shared AI path with regression tests; secure Electron shell and existing file-operation integration; package and end-to-end tests including native Open/Save, mocked AI, persistence and pixel parity; final full verification and evidence commit. Tests precede each behavior slice. The final suite launches the packaged executable with isolated user data and intercepts provider fetch in the main process, never by replacing local API handlers.

Review focus: stale stored model choices retain keys; cold and warm OS opens reach the editor; Save cannot overwrite a different imported document; malformed/local traversal requests and external navigation are refused; cancellation and window relaunch retain coherent document state.
