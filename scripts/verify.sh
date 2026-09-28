#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p verification/runs verification/parity
run="verification/runs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$run"
exec > >(tee "$run/verify.log") 2>&1
printf 'Verification log: %s/verify.log\n' "$run"
npm run check
npm test
npm run build
npm run package:mac
npm run test:desktop
printf '\nModel ID audit:\n'
grep -rn 'gemini-\|claude-\|gpt-' src api --include='*.ts' --include='*.tsx' | tee "$run/model-ids.txt"
if grep -vE '^src/lib/models.ts:|\.(test|spec)\.tsx?:' "$run/model-ids.txt"; then
  printf 'Model IDs escaped the SSOT\n' >&2
  exit 1
fi
app="release/mac-$(node -p process.arch)/Coil.app"
test -d "$app"
/usr/libexec/PlistBuddy -c 'Print :CFBundleDocumentTypes' "$app/Contents/Info.plist" | tee "$run/document-types.txt"
grep -q fountain "$run/document-types.txt"
printf '\nVERIFICATION PASSED\nApp: %s\n' "$app"
