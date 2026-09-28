# Web / Mac parity

Captured by tests/desktop.spec.ts from the production Vite build and packaged release/mac-arm64/Coil.app, using tests/fixtures/coil-parity.fountain at 1280 × 800 CSS pixels, device scale 1, dark mode, and bundled identical fonts. No image masks or postprocessing.

Acceptance: pixelmatch differing-pixel ratio ≤ 0.01 (1%) with color threshold 0.1. result.json contains the measured values; diff.png marks differences. Current result is 897 / 1,024,000 pixels (0.0876%). web.png and mac.png were opened with view_image and visually inspected: matching editor layout, typography, scene navigation, colors, and controls.

file-open.png is captured after the real File > Open menu callback, main-process file read, preload event, and existing import/editor path. Playwright supplies the native picker result. analysis.png and rewrite.png show successful mocked provider results through the shared local API handlers; these were also visually inspected.

The full verification run passed, including five LaunchServices autosave/quit/relaunch cycles with restored document content and window bounds. See ../../VERIFICATION.md for real output and the distinction between native LaunchServices lifecycle checks and direct-exec Playwright cleanup.
