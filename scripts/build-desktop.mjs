import { build } from 'esbuild'
const define = {}
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'COIL_TESTER_TOKENS']) define[`process.env.${key}`] = 'undefined'
await build({ entryPoints: ['desktop/main.ts'], outfile: 'dist-desktop/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], define })
await build({ entryPoints: ['desktop/preload.ts'], outfile: 'dist-desktop/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
