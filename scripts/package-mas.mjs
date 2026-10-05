// Mac App Store packaging. `npm run package:mas` (App Store build) / `npm run package:mas-dev` (local sandboxed test build).
// Fails fast, before any build, if the Apple-side inputs are missing. It never reads or lists the keychain itself:
// electron-builder looks the named identity up and fails with its own message if the certificate is not installed.
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

const dev = process.argv[2] === 'dev'
const prefix = dev ? 'COIL_MAS_DEV' : 'COIL_MAS'
const target = dev ? 'mas-dev' : 'mas'
const profileVar = `${prefix}_PROFILE`
const identityVar = `${prefix}_IDENTITY`
const profile = process.env[profileVar]
const identity = process.env[identityVar]

const problems = []
if (!profile) problems.push(`${profileVar} is not set (absolute path to the ${dev ? 'Mac App Development' : 'Mac App Store'} .provisionprofile; keep it outside this repo)`)
else if (!existsSync(profile) || !statSync(profile).isFile()) problems.push(`${profileVar}=${profile} is not a file`)
if (!identity) problems.push(`${identityVar} is not set (signing identity name, e.g. "${dev ? 'Apple Development' : 'Apple Distribution'}: Your Name (TEAMID)")`)
if (problems.length) {
  console.error(`package:${target} cannot run without Apple credentials:\n  - ${problems.join('\n  - ')}\nSteps to obtain them: NOTES-MAS.md`)
  process.exit(1)
}

// Fuses are RELEASE-only: the Playwright suite launches the dir build over inspect/automation, so they are not in package.json.
const fuses = ['runAsNode=false', 'enableNodeOptionsEnvironmentVariable=false', 'enableNodeCliInspectArguments=false', 'onlyLoadAppFromAsar=true', 'grantFileProtocolExtraPrivileges=false']
const section = dev ? 'masDev' : 'mas'
const args = [
  'electron-builder', '--mac', target, dev ? '--arm64' : '--universal',
  `-c.${section}.identity=${identity}`, `-c.${section}.provisioningProfile=${profile}`,
  ...fuses.map((f) => `-c.electronFuses.${f}`),
]

const run = (cmd, a) => spawnSync(cmd, a, { stdio: 'inherit' }).status ?? 1
const built = run('npm', ['run', 'build:desktop'])
if (built !== 0) process.exit(built)
process.exit(run('npx', args))
