import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['auth-session.spec.ts', 'auth-recovery.spec.ts'],
  workers: 1,
  retries: 0,
  updateSnapshots: 'none',
  use: { baseURL: 'http://localhost:15300', serviceWorkers: 'block' },
  webServer: {
    cwd: resolve(import.meta.dirname, '..'),
    command: 'bun vite --config e2e/auth-fixture.vite.config.ts',
    url: 'http://localhost:15300/e2e/fixtures/auth-session.html',
    reuseExistingServer: false
  }
})
