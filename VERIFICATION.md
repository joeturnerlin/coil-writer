# VERIFICATION

Status: **PASSED**. `scripts/verify.sh` exited **0** on 2026-09-28. All BRIEF.md DONE WHEN items and the revised Round 1 durability checks are satisfied. No production shutdown workaround or test hook was added; `desktop/main.ts` is unchanged from the previously packaged implementation. BLOCKED.md has been removed.

✓ Ran: `scripts/verify.sh > verification/runs/round1-final-console.log 2>&1`. This ran `npm run check`, `npm test`, `npm run build`, `npm run package:mac`, `npm run test:desktop`, the model-ID audit, and the packaged Info.plist audit. All exited 0. Host: macOS 27.0 (26A428), arm64; Node v24.12.0; npm 11.6.2; Electron 44.4.5. Complete output: [verify.log](verification/runs/20260928-102536/verify.log). The excerpts below preserve actual output with terminal escapes and trailing spaces removed.

Check and unit output:

```text
Checked 89 files in 27ms. No fixes applied.
Found 20 warnings.

Test Files  4 passed (4)
      Tests  42 passed (42)
   Start at  10:25:36
   Duration  336ms (transform 189ms, setup 0ms, collect 270ms, tests 105ms, environment 0ms, prepare 144ms)
```

Web build and packaging excerpts:

```text
✓ built in 1.35s
  • electron-builder  version=26.15.3 os=27.0.0
  • packaging       platform=darwin arch=arm64 electron=44.4.5 appOutDir=release/mac-arm64
  • skipped macOS code signing  reason=identity explicitly is set to null
```

✓ Path: The packaged app was launched through `/usr/bin/open -n -a <absolute Coil.app path> --args ...`, using a unique user-data directory and temporary local inspector/CDP attachments. The first launch included the Fountain fixture. Playwright typed five unique marker lines in five consecutive cycles. Each cycle waited for the app's existing two-second Dexie autosave to commit, observed through a readonly IndexedDB transaction. After normal Quit and relaunch, assertions compared the complete CodeMirror document and committed IndexedDB record exactly with the pre-quit document, including all prior markers, and verified distinct saved window bounds. CodeMirror's view document was read because DOM text omits virtualized lines.

✓ Path: Inspector and browser clients disconnected before AppleScript sent the app its real Quit event. The harness found the PID using the exact bundle binary path and unique profile, rejected other running instances of the same bundle, asserted before-quit → will-quit → quit, and required process disappearance within ten seconds. All six LaunchServices quits (five cycles plus final cleanup) exited without forced termination in **116–386 ms**. Failure cleanup cannot turn a failed lifecycle assertion into a pass.

✓ Path: The four existing in-window tests still use Playwright `_electron`. They assert the real quit lifecycle events before the harness terminates its own directly executed child. This is explicitly harness cleanup, not evidence of native process exit. LaunchServices is the independent lifecycle acceptance path. The earlier direct-exec stall matches the reported behavior in [electron/electron#52582](https://github.com/electron/electron/issues/52582); our LaunchServices results establish the launch-path distinction on this host.

✓ Path: Production frontend → coil://app → native File menu → main-process file read → preload → existing importer/editor. The suite asserted cold file arguments, native open-file events, same-name and empty-file replacement, Save, Save As, FDX export to actual files, remembered bounds, and File > Open after the last window closed. Sandbox, blocked remote requests, external-link delegation, path traversal refusal, missing-key handling, desktop rate-limit bypass, and persisted model/key migration passed.

✓ Path: Settings key → visible Rewrite and Analyze controls → relative /api/* → protocol.handle → shared API handlers → mocked main-process provider fetch → visible results. Both calls requested the SSOT Fable default with the entered key. No real provider request occurred.

✓ Path: Web and packaged app rendered the same fixture at 1280 × 800 CSS pixels with the same bundled fonts, no masks, and pixelmatch color threshold 0.1. **897 / 1,024,000 pixels differ (0.0876%), below the 1% limit.** Opened the newly generated web, Mac, Analyze and Rewrite captures with view_image: matching editor layout, typography, colors, scene navigation and controls. Canonical artifacts: [web](verification/parity/web.png), [Mac](verification/parity/mac.png), [diff](verification/parity/diff.png), [native File Open](verification/parity/file-open.png), [Analyze](verification/parity/analysis.png), [Rewrite](verification/parity/rewrite.png), [result](verification/parity/result.json).

Actual Electron-suite and final audit output:

```text
PARITY {"width":1280,"height":800,"differentPixels":897,"ratio":0.0008759765625,"maximumRatio":0.01,"pixelmatchThreshold":0.1}
AI: Rewrite and Analyze reached the shared local handlers; both requested claude-fable-5-1 with the Settings key.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
  ✓  1 tests/desktop.spec.ts:86:1 › packaged app matches web pixels and executes native Open, Rewrite and Analyze (3.3s)
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
NATIVE: cold file argument, open-file event, File > Open/Save/Save As/Export, and remembered window bounds passed.
  ✓  2 tests/desktop.spec.ts:148:1 › OS file events, cold opens, Save/Save As/Export and window state work (2.4s)
SECURITY: sandbox, local-only requests, external-link delegation, missing-key refusal, traversal refusal, and persisted-key migration passed.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
  ✓  3 tests/desktop.spec.ts:198:1 › desktop refuses remote content, opens external links in the browser and migrates stale models without losing keys (875ms)
NATIVE: File > Open recreates the closed window and loads the script.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
  ✓  4 tests/desktop.spec.ts:235:1 › File > Open recreates the editor after closing the last window (1.1s)
LAUNCHSERVICES: pid=56484; before-quit > will-quit > quit; process gone in 282ms; no forced exit.
DURABILITY 1/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-keocgS cycle 1.
LAUNCHSERVICES: pid=56529; before-quit > will-quit > quit; process gone in 143ms; no forced exit.
DURABILITY 2/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-keocgS cycle 2.
LAUNCHSERVICES: pid=56608; before-quit > will-quit > quit; process gone in 277ms; no forced exit.
DURABILITY 3/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-keocgS cycle 3.
LAUNCHSERVICES: pid=56691; before-quit > will-quit > quit; process gone in 386ms; no forced exit.
DURABILITY 4/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-keocgS cycle 4.
LAUNCHSERVICES: pid=56753; before-quit > will-quit > quit; process gone in 116ms; no forced exit.
DURABILITY 5/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-keocgS cycle 5.
LAUNCHSERVICES: pid=56773; before-quit > will-quit > quit; process gone in 289ms; no forced exit.
  ✓  5 tests/desktop.spec.ts:250:1 › LaunchServices preserves normal autosaves and window bounds across five quit/relaunch cycles (20.3s)

  5 passed (29.2s)

Model ID audit:
src/lib/models.ts:10:  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', provider: 'anthropic' },
src/lib/models.ts:11:  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'anthropic' },
src/lib/models.ts:12:  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic' },
src/lib/models.ts:13:  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
src/lib/models.ts:14:  { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'openai' },
src/lib/models.ts:19:export const OPTIONAL_GOOGLE_MODEL: AIModel = { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' }
Array {
    Dict {
        CFBundleTypeName = Fountain Screenplay
        CFBundleTypeExtensions = Array {
            fountain
        }
        CFBundleTypeRole = Editor
        LSHandlerRank = Default
        CFBundleTypeIconFile = icon.icns
    }
}

VERIFICATION PASSED
App: release/mac-arm64/Coil.app
```

✓ Ran: `git diff --check` and the staged equivalent, both clean. Read-only review led to exact full-document recovery assertions, guards against ambiguous bundle instances including argument-free Finder launches, and cleanup restricted to the owned process after failed runs. The unsigned [.app](release/mac-arm64/Coil.app) exists and declares the Fountain document type, as shown above.

⚠ Not verified: Quitting before the existing two-second autosave completes, power loss, and unrelated in-flight file writes were not tested; durability assertions intentionally wait for normal persistence as requested. Finder double-click and Dock-drop gestures were not manually exercised; LaunchServices launch, the cold document argument, open-file handler and registration were exercised. PDF printing/export and a production Vercel deployment were not tested. Real provider calls, Astra's native API slug, and Fable-specific header requirements remain unverified as directed in BRIEF.md. No push, deployment, /Applications installation, signing, or notarization was performed. Check reports 20 warning-level findings, and existing tokenizer highlighting stderr and the large web-bundle warning remain visible in the full log. The initial unrelated `.gitignore` edit remains unstaged.
