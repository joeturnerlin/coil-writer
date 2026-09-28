# Web / Mac parity

Captured by tests/desktop.spec.ts during the passing 2026-09-28 10:47:09 verification run from the production Vite build and packaged release/mac-arm64/Coil.app. Both use tests/fixtures/coil-parity.fountain at 1280 × 800 CSS pixels, device scale 1, dark mode, identical bundled fonts, and `--force-color-profile=srgb` at process launch. No masks or post-capture color transforms.

Acceptance: pixelmatch differing-pixel ratio ≤ **0.0005 (0.05%)**, color threshold **0.01**, `includeAA: false`. Separately, every full-intensity cyan (0,240,255) and amber (232,160,64) reference pixel must have maximum RGB-channel delta ≤ 1, with more than 300 samples of each. This catches uniform accent shifts independently of their thin text footprint.

Current result: **308 / 1,024,000 pixels (0.030078125%)**. All 480 cyan and 435 amber samples match exactly (maximum channel delta 0). [result.json](result.json) records the values; [diff.png](diff.png) marks differences. Final web.png, mac.png and diff.png were opened with view_image: matching editor layout, typography, scene navigation and controls, with small edge-rasterization differences. These measurements certify the pinned capture configuration, not ordinary unflagged Finder-launch color behavior or bit-identical rendering.

file-open.png follows the real File > Open menu callback, main-process read, preload event and existing importer/editor. Playwright supplies the picker result. analysis.png and rewrite.png show successful mocked responses through the shared local API handlers and were also visually inspected. All canonical captures correspond to this run.

The full run passed 52 unit tests and 6 desktop tests, including five native LaunchServices autosave/quit/relaunch cycles with exact document recovery and restored bounds, native cold document delivery, and second-instance forwarding. The complete [verify.log](verify.log) is committed with terminal escapes and trailing whitespace removed. See [VERIFICATION.md](../../VERIFICATION.md) for the pasted tail, live paths, limitations and direct-exec harness cleanup distinction.
