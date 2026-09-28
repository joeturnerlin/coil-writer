# VERIFICATION

Status: **BLOCKED**. The final `scripts/verify.sh` exited **1**. DONE WHEN item 1 remains open because normal Electron process shutdown times out on this Mac. See [BLOCKED.md](BLOCKED.md) for an independent plain-Electron reproducer and controls across three runtime versions. This document does not certify the whole brief complete.

Host: macOS 27.0 (26A428), arm64; Node v24.12.0; npm 11.6.2; Electron 44.4.5. Implementation commits: `ec6fa79`, `04dc13a` on `mac-app`.

✓ Ran: `scripts/verify.sh > verification/runs/final-console.log 2>&1`. It ran `npm run check`, `npm test`, `npm run build`, `npm run package:mac`, and `npm run test:desktop`. The first four commands exited 0; the Electron suite exited 1 with four shutdown failures. Full actual output: [verify.log](verification/runs/20260928-003609/verify.log). Excerpts below are pasted from that run; terminal color escapes and trailing spaces are removed.

Check output (20 warning-level findings remain; no errors):

```text
Checked 89 files in 15ms. No fixes applied.
Found 20 warnings.
```

Unit output:

```text
Test Files  4 passed (4)
      Tests  42 passed (42)
   Start at  00:36:09
   Duration  294ms (transform 137ms, setup 0ms, collect 210ms, tests 103ms, environment 0ms, prepare 132ms)
```

Web build output:

```text
> recoil-fountain-editor@0.1.0 build
> tsc -b && vite build

vite v6.4.1 building for production...
transforming...
✓ 1676 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                            0.47 kB │ gzip:   0.31 kB
dist/assets/index-CAWgeih3.css            14.88 kB │ gzip:   4.25 kB
dist/assets/highland-pWQ8qNOQ.js           1.10 kB │ gzip:   0.56 kB
dist/assets/sequence--TQ9hfsk.js           1.66 kB │ gzip:   0.60 kB
dist/assets/story-structure-BpFjzeyk.js    1.75 kB │ gzip:   0.65 kB
dist/assets/celtx-CeMchNIa.js              1.92 kB │ gzip:   0.96 kB
dist/assets/writerduet-nPpb3GE7.js         2.00 kB │ gzip:   0.90 kB
dist/assets/fadein-DSDjkmUW.js             2.39 kB │ gzip:   1.12 kB
dist/assets/heros-journey-DAVLvYCV.js      2.47 kB │ gzip:   0.83 kB
dist/assets/save-the-cat-W92hXvSf.js       2.93 kB │ gzip:   0.99 kB
dist/assets/jszip.min-DLvc68oE.js         97.54 kB │ gzip:  30.32 kB
dist/assets/index-D8K5wYs1.js            831.82 kB │ gzip: 258.27 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.30s
```

Mac package output:

```text
> recoil-fountain-editor@0.1.0 package:mac
> npm run build:desktop && electron-builder --mac --dir


> recoil-fountain-editor@0.1.0 build:desktop
> tsc -p tsconfig.desktop.json && node scripts/build-desktop.mjs

  • electron-builder  version=26.15.3 os=27.0.0
  • loaded configuration  file=package.json ("build" field)
  • skipped dependencies rebuild  reason=npmRebuild is set to false
  • packaging       platform=darwin arch=arm64 electron=44.4.5 appOutDir=release/mac-arm64
  • downloaded      label=electron progress=100%
  • downloaded electron zip extracted successfully  output=/Users/joeturnerlin/Code/coil/release/mac-arm64
  • searching for node modules  pm=npm searchDir=/Users/joeturnerlin/Code/coil
  • duplicate dependency references  dependencies=["@codemirror/language@6.12.2","@codemirror/state@6.5.4","@codemirror/view@6.39.16","@codemirror/language@6.12.2","@codemirror/state@6.5.4","@codemirror/view@6.39.16","@codemirror/state@6.5.4","@codemirror/view@6.39.16","@codemirror/state@6.5.4","@codemirror/view@6.39.16","@codemirror/state@6.5.4","@tybys/wasm-util@0.10.4","@upstash/redis@1.37.0","@upstash/redis@1.37.0"]
  • skipped macOS code signing  reason=identity explicitly is set to null
```

✓ Path: Playwright launched `release/mac-arm64/Coil.app/Contents/MacOS/Coil`, loaded the production frontend at `coil://app`, and exercised the actual File menu callback → main-process file read → preload event → shared import/editor path. The suite exercised cold file arguments and open-file events, same-name and empty-file replacement, Save, Save As, and FDX export through real filesystem writes. The last test closed the only window, invoked File > Open, and asserted the recreated editor contained the fixture.

✓ Path: Settings key → renderer Rewrite and Analyze controls → relative `/api/*` → `protocol.handle` → shared API handlers → mocked main-process provider fetch → visible results. Both recorded requests used the Fable default and entered key. No real provider was called. Sandbox preferences, absent renderer require, blocked remote fetch, external-link delegation, traversal rejection, missing-key handling, desktop rate-limit bypass, and persisted model/key migration were asserted.

Actual functional output before shutdown failures:

```text
PARITY {"width":1280,"height":800,"differentPixels":897,"ratio":0.0008759765625,"maximumRatio":0.01,"pixelmatchThreshold":0.1}
AI: Rewrite and Analyze reached the shared local handlers; both requested claude-fable-5-1 with the Settings key.
SECURITY: sandbox, local-only requests, external-link delegation, missing-key refusal, traversal refusal, and persisted-key migration passed.
NATIVE: File > Open recreates the closed window and loads the script.
```

✓ Path: The web preview and packaged app used the same fixture at 1280 × 800 CSS pixels. Pixelmatch threshold 0.1, maximum differing-pixel ratio 1%, no masks. Actual difference: **897 pixels / 1,024,000 = 0.0876%**. Opened the current web, Mac, Rewrite and Analyze PNGs with `view_image`; editor layout, typography, colors, navigation and controls match. Captures: [web](verification/parity/web.png), [Mac](verification/parity/mac.png), [diff](verification/parity/diff.png), [native File Open](verification/parity/file-open.png), [Analyze](verification/parity/analysis.png), [Rewrite](verification/parity/rewrite.png), [measured result](verification/parity/result.json).

✓ Ran: Since the script stops at the failed suite, ran its independent model and package audits separately. `grep -rn "gemini-\|claude-\|gpt-" src api --include='*.ts' --include='*.tsx'` exited 0; every result is in the SSOT:

```text
src/lib/models.ts:10:  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', provider: 'anthropic' },
src/lib/models.ts:11:  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', provider: 'anthropic' },
src/lib/models.ts:12:  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic' },
src/lib/models.ts:13:  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
src/lib/models.ts:14:  { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'openai' },
src/lib/models.ts:19:export const OPTIONAL_GOOGLE_MODEL: AIModel = { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' }
```

✓ Ran: `/usr/libexec/PlistBuddy -c 'Print :CFBundleDocumentTypes' release/mac-arm64/Coil.app/Contents/Info.plist` exited 0. The unsigned local [.app](release/mac-arm64/Coil.app) exists and declares the Fountain document type:

```text
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
```

Final Electron failure output:

```text
  1) tests/desktop.spec.ts:72:1 › packaged app matches web pixels and executes native Open, Rewrite and Analyze

    Error: Electron did not finish normal shutdown within 60 seconds

      42 |     await Promise.race([
      43 |       app.close(),
    > 44 |       new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Electron did not finish normal shutdown within 60 seconds')), 60000) }),
         |                                                                              ^
      45 |     ])
      46 |     await expect.poll(() => child.exitCode).toBe(0)
      47 |   } finally {
        at Timeout.<anonymous> (/Users/joeturnerlin/Code/coil/tests/desktop.spec.ts:44:78)

    Error Context: verification/runs/playwright/desktop-packaged-app-match-fcf40-ve-Open-Rewrite-and-Analyze/error-context.md

  2) tests/desktop.spec.ts:134:1 › OS file events, cold opens, Save/Save As/Export and window state work

    Error: Electron did not finish normal shutdown within 60 seconds

      42 |     await Promise.race([
      43 |       app.close(),
    > 44 |       new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Electron did not finish normal shutdown within 60 seconds')), 60000) }),
         |                                                                              ^
      45 |     ])
      46 |     await expect.poll(() => child.exitCode).toBe(0)
      47 |   } finally {
        at Timeout.<anonymous> (/Users/joeturnerlin/Code/coil/tests/desktop.spec.ts:44:78)

  3) tests/desktop.spec.ts:184:1 › desktop refuses remote content, opens external links in the browser and migrates stale models without losing keys

    Error: Electron did not finish normal shutdown within 60 seconds

      42 |     await Promise.race([
      43 |       app.close(),
    > 44 |       new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Electron did not finish normal shutdown within 60 seconds')), 60000) }),
         |                                                                              ^
      45 |     ])
      46 |     await expect.poll(() => child.exitCode).toBe(0)
      47 |   } finally {
        at Timeout.<anonymous> (/Users/joeturnerlin/Code/coil/tests/desktop.spec.ts:44:78)

  4) tests/desktop.spec.ts:221:1 › File > Open recreates the editor after closing the last window ──

    Error: Electron did not finish normal shutdown within 60 seconds

      42 |     await Promise.race([
      43 |       app.close(),
    > 44 |       new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error('Electron did not finish normal shutdown within 60 seconds')), 60000) }),
         |                                                                              ^
      45 |     ])
      46 |     await expect.poll(() => child.exitCode).toBe(0)
      47 |   } finally {
        at Timeout.<anonymous> (/Users/joeturnerlin/Code/coil/tests/desktop.spec.ts:44:78)

  4 failed
    tests/desktop.spec.ts:72:1 › packaged app matches web pixels and executes native Open, Rewrite and Analyze
    tests/desktop.spec.ts:134:1 › OS file events, cold opens, Save/Save As/Export and window state work
    tests/desktop.spec.ts:184:1 › desktop refuses remote content, opens external links in the browser and migrates stale models without losing keys
    tests/desktop.spec.ts:221:1 › File > Open recreates the editor after closing the last window ───
```

⚠ Not verified: A full successful suite and reliable normal app shutdown remain blocked. Window-state restoration has a regression assertion but its complete clean-exit lifecycle is not certified by this run. Finder double-click, Dock drop and Launch Services `open -a` gestures were not manually exercised; the registered document type, cold file argument and native open-file handler were exercised. PDF printing/export was not exercised. Web production deployment was not changed or tested. Real provider credentials, Astra's native API slug and any Fable-specific header requirements remain unverified as directed in BRIEF.md. No push, deployment, /Applications install, paid provider call, Apple signing or notarization was performed.

Existing tokenizer unknown-highlighting-tag stderr and the web bundle-size warning remain visible in the logs. The original 55 lint errors were repaired without disabling rules; warning-level findings remain. The unrelated initial `.gitignore` change remains unstaged.
