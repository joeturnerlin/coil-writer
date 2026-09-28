import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', testMatch: 'desktop.spec.ts', workers: 1,
  timeout: 180000, outputDir: 'verification/runs/playwright', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort', url: 'http://127.0.0.1:4178', reuseExistingServer: false },
})
