# Blocked: native Electron shutdown on this Mac

DONE WHEN item 1 remains open. `scripts/verify.sh` reaches the packaged Electron suite, then fails normal process shutdown. Implementation and packaging are committed; this is not a completed verification run.

Host: macOS 27.0 (26A428), arm64; Node v24.12.0; packaged Electron 44.4.5.

Reproduce from this checkout:

```sh
scripts/verify.sh
# Or, after building:
npm run test:desktop -- -g 'packaged app matches'
```

Exact test error:

```text
Error: Electron did not finish normal shutdown within 60 seconds
```

The watchdog marks the test failed, then terminates only its own stalled child. Forced termination is not counted as a passing exit. No production forced-exit workaround is included.

## Independent reproduction

A plain Electron BrowserWindow, with no Coil source, provider request, Playwright, inspector, or window resizing, emits before-quit, will-quit, Node exit, and quit, but remains alive beyond 75 seconds. A no-window control exits normally. Electron 42.11.8 and 43.7.5 show the same failure; neither provides an evidence-supported version pin. Disabling hardware acceleration and calling app.exit(0) also failed their 20-second controls. This localizes the observed failure to native shutdown on this host; the exact framework cause remains unresolved. The timeout does not establish indefinite nontermination.

The diagnostic files remain in ignored `verification/runs/review-quit/`. Exact command:

```sh
node verification/runs/review-quit/long-runner.mjs
```

For reproduction after a fresh clone, save the following as `verification/runs/plain-quit.cjs`, then run `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron verification/runs/plain-quit.cjs --visible`. It should quit by itself after loading the blank window; interrupt the diagnostic if it remains alive. Add `--no-window` for the control.

```js
const { app, BrowserWindow } = require('electron');
app.on('window-all-closed', () => {});
for (const event of ['before-quit','will-quit','quit']) app.on(event, () => console.error('LIFECYCLE',event));
process.on('exit',()=>console.error('NODE_EXIT'));
app.whenReady().then(async () => {
 if(!process.argv.includes('--no-window')) {
  const win = new BrowserWindow({show:!process.argv.includes('--hidden'),width:1280,height:800,webPreferences:{sandbox:true}});
  await win.loadURL('about:blank');
 }
 setTimeout(()=>app.quit(),500);
});
```

Actual diagnostic output:

```text
Read-only Coil shutdown diagnosis; fixtures and output under verification/runs/review-quit only.
Host: macOS 27.0 (26A428), arm64.

node verification/runs/review-quit/plain-runner.mjs
{"mode":"--no-window","result":{"code":0,"signal":null},"ms":648,"pid":34976}
{"mode":"--hidden","result":"HANG","ms":8003,"pid":35013}
{"mode":"--visible","result":"HANG","ms":8002,"pid":35026}

node verification/runs/review-quit/long-runner.mjs
Electron44.4.5, plain visible about:blank BrowserWindow, no inspector/Playwright/setBounds.
LIFECYCLE before-quit
LIFECYCLE will-quit
NODE_EXIT
LIFECYCLE quit
{"mode":"--visible","result":"HANG","ms":75005,"pid":35104}

node verification/runs/review-quit/runner43.mjs
Electron43.7.5, same plain visible fixture.
LIFECYCLE before-quit
LIFECYCLE will-quit
NODE_EXIT
LIFECYCLE quit
{"mode":"--visible","result":"HANG","ms":75005,"pid":35802}

HANG means did not exit by the stated watchdog duration; own child then killed. It does not establish indefinite nontermination.
No normal exit observed for either75s windowed control. No-window control exited0.
Samples: plain44.sample, plain43.sample.44 main native stack matches Coil quit-hang.sample offsets, ending mach_msg.
All provider traffic absent from these fixtures. No parent-owned Coil process killed.

node verification/runs/review-quit/workaround-runner.mjs
{"mode":"--disable-hw","result":"HANG","ms":20002,"pid":37365}
{"mode":"--app-exit","result":"HANG","ms":20001,"pid":37487}
Both emitted NODE_EXIT + quit; no immediate clean exit.

node verification/runs/review-quit/runner42.mjs
Electron42.11.8, same plain visible fixture.
LIFECYCLE before-quit
LIFECYCLE will-quit
NODE_EXIT
LIFECYCLE quit
{"mode":"--visible","result":"HANG","ms":75003,"pid":38081}

Final comparison:42.11.8,43.7.5,44.4.5 all failed normal exit by75s after creating visible BrowserWindow on this host. No pin to42/43 supported by evidence. Hardware-disabled quit and app.exit(0) also failed20s controls. Exact native cause unresolved; no further repeats performed.
```

## Remaining action

Resolve the native shutdown failure, or rerun on a compatible Mac/Electron runtime and obtain a normal zero exit. Then rerun the entire `scripts/verify.sh` and replace the blocked status in VERIFICATION.md with its actual output. Window-bounds restoration after normal quit must also complete in that run. Do not waive the shutdown assertion or count killed processes as successful verification.
