import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'location-missing-coordinate.spec.ts',
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:15413',
    headless: true,
    serviceWorkers: 'block',
    viewport: { width: 1100, height: 800 }
  },
  webServer: {
    command: 'bunx vite --config location-harness/vite.config.ts',
    url: 'http://127.0.0.1:15413',
    reuseExistingServer: false
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium' } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } }
  ]
})
