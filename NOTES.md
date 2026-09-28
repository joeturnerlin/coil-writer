# Implementation notes

BRIEF.md is the approved design. Work stays in this standalone mac-app checkout; the initial unrelated .gitignore addition is preserved. The stale finance scratchpad is unrelated to this assignment.

The renderer owns editor state and existing IndexedDB/localStorage persistence. src/lib/models.ts owns model IDs and defaults. Electron owns the native document path, OS dialogs, window bounds, and menus. The same built frontend runs at coil://app; protocol.handle sends /api requests to the existing handlers in the main process. Errors return through the existing UI or native error dialogs. Deleting the shell leaves the web app intact.

Use electron-builder with its directory target: one packager, native file associations, and an inspectable local .app without distribution or notarization. Bundle main/preload with esbuild; sandboxed preload exposes document actions only, never arbitrary IPC, paths, network, or Node access.

Analysis is actually a Node-style Vercel function, despite the brief's general Edge-handler description. Preserve its default Node export and maxDuration; expose the shared Request/Response implementation for Electron. Desktop bundles disable Upstash and environment key fallbacks at build time. User keys stay in existing Settings storage and go only to provider APIs through the main process.

The current frontend loads Google Fonts remotely. Bundle those same font assets and licenses, using identical CSS for web and desktop. No component styling redesign. Gemini is selectable only with an entered Google key; all unkeyed Gemini defaults and retired selections migrate to the approved defaults. Existing keys are retained.

TODO: Confirm the native OpenAI Astra slug against https://platform.openai.com/docs/models before a paid call; use the brief's gpt-6-astra meanwhile. TODO: Confirm any Fable-specific Anthropic header at https://docs.anthropic.com/en/api/messages before a paid call; retain the existing documented anthropic-version header. No real provider calls are authorized or needed for this build.

Implementation sequence: model SSOT and shared AI path with regression tests; secure Electron shell and existing file-operation integration; package and end-to-end tests including native Open/Save, mocked AI, persistence and pixel parity; final full verification and evidence commit. Tests precede each behavior slice. The final suite launches the packaged executable with isolated user data and intercepts provider fetch in the main process, never by replacing local API handlers.

Review focus: stale stored model choices retain keys; cold and warm OS opens reach the editor; Save cannot overwrite a different imported document; malformed/local traversal requests and external navigation are refused; cancellation and window relaunch retain coherent document state.

Baseline verification before source edits: 33 unit tests pass; npm run check fails with 55 errors and 19 warnings (verification/runs/baseline-check.log). The required clean check needed local mechanical fixes: equivalent string/regex expressions, explicit optional-ID handling, label associations, click keyboard handlers, stable list keys, and formatting. Existing warning-level hook dependencies remain unchanged. Autofocus is retained through the input ref. No lint rules or acceptance thresholds are disabled.

The desktop file bridge identifies opened files with opaque IDs; only main holds their paths. Save uses that ID, while imported/dropped/recovered documents require Save As. Opening another same-named or empty script must replace editor content; documentVersion in the existing editor store provides that signal. Save As changes the native target without resetting the editor buffer.

Parity uses 1280×800 CSS pixels, the same fixture and local fonts, no masked regions, and a maximum differing-pixel ratio of 1% at pixelmatch color threshold 0.1. Main-process provider fetch is mocked by Playwright after launch; unknown destinations throw. No test-only provider behavior ships in the app.

Electron and packager interfaces checked against https://www.electronjs.org/docs/latest/api/protocol and https://www.electron.build/docs/api/app-builder-lib.interface.fileassociation/. Bundled Google Fonts use SIL OFL licenses retained in public/fonts/. The icon is original AppKit vector drawing in scripts/create-icon.swift; build/icon.png and build/icon.icns are its outputs.

The review caught and corrected the Save As/open race (a delayed result cannot rename a different document), remaining web Gemini environment-key fallbacks, and File > Open after closing the last window. Regression output is in verification/runs/review-red.log and review-green.log. The reviewer rechecked those fixes without finding new important issues.

The Electron test harness calls the real app.quit through Playwright and requires normal process exit. A 60-second teardown watchdog fails the test and cleans up only its own child process if native shutdown stalls. No production test hooks or provider mocks are packaged. Tests use isolated user-data directories, mock native file-picker results, and exercise the actual menu callbacks, IPC, converters, filesystem writes, and editor selection/analysis controls.

Final verification is blocked by native Electron shutdown on this macOS 27.0 host. A plain about:blank BrowserWindow reproduces beyond 75 seconds on Electron 42, 43, and 44, while a no-window control exits normally. No version downgrade or forced production exit is justified by the controls. BLOCKED.md preserves the exact reproducer and actual diagnostic output; the full suite must still finish with normal process exits before acceptance.

The final scripts/verify.sh run exited 1: check, all 42 unit tests, web build, and packaging passed; all four packaged Electron tests failed the same normal-shutdown timeout. Parity measured 897 of 1,024,000 pixels (0.0876%) below the 1% threshold. Canonical captures were visually inspected. Model SSOT and Info.plist audits passed separately after the script stopped. No paid provider, shared-system, deployment, push, or /Applications action was performed.
