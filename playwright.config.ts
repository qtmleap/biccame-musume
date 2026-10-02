import { defineConfig } from '@playwright/test'
// Dedicated component harnesses have their own entrypoint/config; never discover them against the app.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['routes.test.ts', 'sticky-check.spec.ts', 'visual-check.spec.ts', 'local-auth.spec.ts'],
  timeout: 30000,
  retries: 0,
  workers: 1,
  updateSnapshots: 'none',
  snapshotPathTemplate:
    process.env.A15_CANDIDATES === '1'
      ? '{testDir}/../.cache/a15/candidates/{arg}{ext}'
      : '{testDir}/approved/{arg}{ext}',
  expect: { timeout: 10000, toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
  use: {
    baseURL: 'http://127.0.0.1:15300',
    headless: true,
    serviceWorkers: 'block',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    contextOptions: { reducedMotion: 'reduce' },
    deviceScaleFactor: 1
  },
  webServer: [
    {
      command:
        'env -u CLOUDFLARE_ENV CLOUDFLARE_VITE_FORCE_LOCAL=true E2E=1 bun vite --config e2e/local/vite.config.ts',
      url: 'http://127.0.0.1:15300/e2e/local/index.html',
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command:
        'bunx wrangler dev --local --config e2e/local/wrangler.toml --persist-to .cache/a15/state --port 15301 --ip 127.0.0.1',
      url: 'http://127.0.0.1:15301/health',
      reuseExistingServer: false,
      timeout: 120000
    }
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
})
