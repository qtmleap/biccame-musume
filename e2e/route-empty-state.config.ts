import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'route-empty-state-layout.spec.ts',
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:15409', headless: true, serviceWorkers: 'block' },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'bun vite --config e2e/route-empty-state.vite.config.ts',
    url: 'http://localhost:15409/e2e/route-empty-state-harness.tsx',
    reuseExistingServer: false
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
})
