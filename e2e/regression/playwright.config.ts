import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'guards.spec.ts',
  workers: 1,
  retries: 0,
  updateSnapshots: 'none',
  snapshotPathTemplate: '../../.cache/a15/regression/{arg}{ext}',
  expect: { timeout: 250 },
  use: { serviceWorkers: 'block' }
})
