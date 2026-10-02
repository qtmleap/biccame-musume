import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'map-cluster-responsive.spec.ts',
  retries: 0,
  timeout: 30000,
  outputDir: '../.cache/b06/test-results',
  use: {
    baseURL: 'http://127.0.0.1:15464',
    headless: true,
    serviceWorkers: 'block',
    viewport: { width: 1024, height: 900 },
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'bunx vite --config map-cluster-harness/vite.config.ts',
    url: 'http://127.0.0.1:15464',
    reuseExistingServer: false
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
})
