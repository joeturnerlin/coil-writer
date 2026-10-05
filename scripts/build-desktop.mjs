import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
const define = {}
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'COIL_TESTER_TOKENS']) define[`process.env.${key}`] = 'undefined'
await build({ entryPoints: ['desktop/main.ts'], outfile: 'dist-desktop/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], define })
await build({ entryPoints: ['desktop/preload.ts'], outfile: 'dist-desktop/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })

// The desktop bundle must not read provider/server keys from the environment. Every remaining
// `process.env.NAME` in the bundle has to be on this list (derived from the bundle 2026-10-04:
// @upstash/redis Redis.fromEnv, unreachable because rate-limit.ts passes explicit credentials).
const ALLOWED_ENV = new Set(['KV_REST_API_URL', 'KV_REST_API_TOKEN'])
const bundle = readFileSync('dist-desktop/main.cjs', 'utf8')
const offenders = [...new Set([...bundle.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))].filter((name) => !ALLOWED_ENV.has(name))
if (offenders.length) {
  console.error(`build-desktop: dist-desktop/main.cjs reads unexpected process.env names: ${offenders.join(', ')}`)
  process.exit(1)
}
