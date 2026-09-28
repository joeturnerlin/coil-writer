# coil (mac-app)

Approved design: BRIEF.md — it IS the approval; do not re-propose it. Decisions/assumptions log: NOTES.md.

Verify: `scripts/verify.sh` (lint + unit tests + web build + Mac package + Electron Playwright suite). Run it, fix failures caused by your change, and rerun without asking — it has no external dependencies. Done means verify.sh exits 0 and VERIFICATION.md has real pasted output (Ran / Path / Not verified). Write run outputs to an untracked `verification/runs/` folder; promote only the canonical artifacts (`verification/parity/`).

Never modify: /Users/joeturnerlin/CLAUDE_PROJECTS/recoil/fountain-editor (read-only primary checkout).

Never make a real AI provider call, push, deploy, or install into /Applications. Mock providers in tests.

Bias toward action and carry work to completion. Before asking any question, complete the work already authorized; make reasonable assumptions for non-critical gaps and log them in NOTES.md. Do not stop after the first passing milestone while any DONE WHEN item is open.

Prose in NOTES.md: short paragraphs, no tables.
