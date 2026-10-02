import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'route-result.spec.ts',
  retries: 0,
  use: { baseURL: 'http://localhost:15300', headless: true, serviceWorkers: 'block' },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'CLOUDFLARE_VITE_FORCE_LOCAL=true bun vite --config e2e/route-result.vite.config.ts',
    url: 'http://localhost:15300/e2e/route-result-harness.tsx',
    reuseExistingServer: false
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
})
