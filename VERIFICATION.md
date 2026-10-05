# VERIFICATION

Status: **PASSED**. `scripts/verify.sh` exited **0** on 2026-09-28. All seven BRIEF.md DONE WHEN items and Round 3 findings are resolved. The packaged app has no forced-exit workaround. No BLOCKED.md remains.

✓ Ran: `scripts/verify.sh > verification/runs/round3-final-console.log 2>&1`. The run beginning at 10:47:09 executed lint, unit tests, the production web build, the Mac package build, the packaged Electron suite, the model-ID audit, and the Info.plist audit. The **complete output ships with this branch** in [verify.log](verification/parity/verify.log); only terminal escapes and trailing whitespace were removed. Host: macOS 27.0 (26A428), arm64; Node v24.12.0; npm 11.6.2; Electron 44.4.5.

Actual lint, unit, build and packaging excerpts:

```text
Checked 89 files in 27ms. No fixes applied.
Found 43 warnings.

 Test Files  5 passed (5)
      Tests  52 passed (52)
   Start at  10:47:10
   Duration  311ms (transform 174ms, setup 0ms, collect 305ms, tests 97ms, environment 0ms, prepare 162ms)

✓ built in 1.30s
  • electron-builder  version=26.15.3 os=27.0.0
  • packaging       platform=darwin arch=arm64 electron=44.4.5 appOutDir=release/mac-arm64
  • skipped macOS code signing  reason=identity explicitly is set to null
```

✓ Path: The packaged app launches through LaunchServices with a Fountain document operand, exercising native cold open-file delivery. Five consecutive cycles type unique markers, wait for the normal two-second Dexie autosave, quit through AppleScript, require the exact bundle/profile process to disappear within ten seconds, relaunch, and compare the complete CodeMirror document and IndexedDB record with their pre-quit contents. Distinct window bounds restore each time. All native quits in this run completed in **123–272 ms** after before-quit → will-quit → quit, without forced termination. Inspector/CDP observers disconnect before Quit; failed watchdog checks cannot count as successful shutdown.

✓ Path: A second LaunchServices launch on the same profile exits while the existing owner receives the second-instance event, opens a supported `.txt` document, restores focus, and retains one process and one window. Desktop extension filters and second-instance forwarding derive from FORMAT_DESCRIPTORS. The release build no longer has the primary cold argv shortcut.

✓ Path: The four in-window tests use Playwright `_electron`, assert the real quit lifecycle, then clean up their own directly executed child. That harness-only limitation is documented beside the cleanup with electron/electron#52582. Native process exit is established separately by the LaunchServices checks above. File > Open/Save/Save As/Export, native open-file events, same-name and empty-file replacement, actual FDX output, remembered bounds, and recreating the last closed window all passed.

✓ Path: A healthy local HTTP origin first accepts a web browser's cross-origin `no-cors` request. Coil's renderer then reports a connect-src CSP violation with zero server requests; Electron's main session independently rejects the same URL with ERR_BLOCKED_BY_CLIENT. Removing only the webRequest guard restores main-session access. These positive and negative controls establish both enforcement layers without relying on CORS or an unavailable server. Sandbox configuration, external-link delegation, traversal refusal, missing-key refusal, desktop rate-limit bypass, and persisted key/model migration also passed.

✓ Path: Visible Rewrite and Analyze controls use the Settings key through relative `/api/*` → coil protocol handler → shared API handlers → mocked provider responses, both requesting the SSOT Fable default. Ten additional regression cases cover all five Anthropic handlers' user/server key precedence, token limits, text extraction, missing-key behavior, version header and provider-error responses. All five use the shared Anthropic transport; web rate-limit code is byte-identical to base and the desktop bundle disables Upstash solely through undefined environment values.

✓ Path: Both renderers receive `--force-color-profile=srgb` at process launch. At 1280 × 800, pixelmatch permits **at most 0.05% differing pixels (512 pixels)** with threshold **0.01** and `includeAA: false`. A separate gate requires maximum RGB-channel delta **≤ 1** at every full-intensity cyan and amber reference pixel, with over 300 samples per accent. The result is **308 / 1,024,000 pixels (0.030078125%)**, with **zero channel delta across all 480 cyan and 435 amber samples**. The LaunchServices capture also contains 3,434 exact cyan pixels. No masks or post-capture color transforms are used. Final web, Mac, diff, Analyze and Rewrite captures were opened with view_image; editor layout, typography, scene navigation and controls match, with small edge-rasterization differences visible in the diff.

Canonical captures from this run: [web](verification/parity/web.png), [Mac](verification/parity/mac.png), [diff](verification/parity/diff.png), [File Open](verification/parity/file-open.png), [Analyze](verification/parity/analysis.png), [Rewrite](verification/parity/rewrite.png), [measured result](verification/parity/result.json).

✓ Ran: Base comparison against `2cbb4dc` confirmed AIRewritePopup, DualRewritePopup, AnnotationCard, ContinuityPanel, CharacterHub, OnboardingOverlay, RevisionCard, CharacterCard and api/rate-limit.ts are byte-identical. App and FileDropZone retain only the required desktop integration. The twelve pasted keyboard handlers and both focusInstruction helpers are removed; exact-file/rule Biome overrides retain baseline lint debt as visible warnings, documented in NOTES.md. `git diff --check` and the staged equivalent passed.

Actual complete suite/audit tail:

```text
PARITY {"width":1280,"height":800,"differentPixels":308,"ratio":0.00030078125,"maximumRatio":0.0005,"pixelmatchThreshold":0.01,"includeAA":false,"colorProfile":"srgb","maximumAccentChannelDelta":1,"accents":[{"rgb":[0,240,255],"samples":480,"maxChannelDelta":0},{"rgb":[232,160,64],"samples":435,"maxChannelDelta":0}]}
AI: Rewrite and Analyze reached the shared local handlers; both requested claude-fable-5-1 with the Settings key.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
  ✓  1 tests/desktop.spec.ts:87:1 › packaged app matches web pixels and executes native Open, Rewrite and Analyze (3.0s)
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
NATIVE: open-file event, File > Open/Save/Save As/Export, and remembered window bounds passed.
  ✓  2 tests/desktop.spec.ts:165:1 › OS file events, Save/Save As/Export and window state work (2.5s)
SECURITY: healthy no-cors control resolves; renderer reports connect-src violation; main session reports ERR_BLOCKED_BY_CLIENT; removing webRequest guard restores access.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
  ✓  3 tests/desktop.spec.ts:216:1 › desktop refuses remote content, opens external links in the browser and migrates stale models without losing keys (998ms)
NATIVE: File > Open recreates the closed window and loads the script.
DIRECT_EXEC: before-quit > will-quit > quit observed; own child cleaned up by harness.
  ✓  4 tests/desktop.spec.ts:284:1 › File > Open recreates the editor after closing the last window (1.1s)
NATIVE_COLOR: LaunchServices with sRGB pinned at process launch rendered 3434 exact cyan pixels.
LAUNCHSERVICES: pid=79846; before-quit > will-quit > quit; process gone in 270ms; no forced exit.
DURABILITY 1/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-Nu8SJM cycle 1.
LAUNCHSERVICES: pid=79895; before-quit > will-quit > quit; process gone in 132ms; no forced exit.
DURABILITY 2/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-Nu8SJM cycle 2.
LAUNCHSERVICES: pid=79913; before-quit > will-quit > quit; process gone in 123ms; no forced exit.
DURABILITY 3/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-Nu8SJM cycle 3.
LAUNCHSERVICES: pid=79948; before-quit > will-quit > quit; process gone in 126ms; no forced exit.
DURABILITY 4/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-Nu8SJM cycle 4.
LAUNCHSERVICES: pid=79964; before-quit > will-quit > quit; process gone in 125ms; no forced exit.
DURABILITY 5/5: complete autosaved document and bounds restored after LaunchServices quit/relaunch; marker=Durability marker durability-Nu8SJM cycle 5.
LAUNCHSERVICES: pid=80004; before-quit > will-quit > quit; process gone in 272ms; no forced exit.
  ✓  5 tests/desktop.spec.ts:299:1 › LaunchServices preserves normal autosaves and window bounds across five quit/relaunch cycles (20.1s)
SINGLE_INSTANCE: second launch exited; existing owner opened .txt and restored its window.
LAUNCHSERVICES: pid=80017; before-quit > will-quit > quit; process gone in 266ms; no forced exit.
  ✓  6 tests/desktop.spec.ts:344:1 › a second instance forwards supported documents to the existing owner (1.4s)

  6 passed (30.4s)

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

⚠ Not verified: Color parity for ordinary unflagged Finder launches is not certified; the comparison and LaunchServices test processes explicitly pin sRGB. The images are not bit-identical: the stated budget tolerates small rasterizer differences, and antialias pixels are excluded from the aggregate comparison. Quitting before normal autosave completes, power loss, and unrelated in-flight file writes were not tested. Finder double-click and Dock-drop gestures were not manually exercised; native LaunchServices document delivery and registration were exercised. PDF export and a production Vercel deployment were not tested. Real provider calls, Astra's native API slug and Fable-specific header requirements remain unverified as directed by BRIEF.md. No push, deployment, /Applications installation, signing or notarization was performed. Lint reports 43 warning-level findings; tokenizer stderr, bundle-size and packager warnings remain visible in the complete committed log.
