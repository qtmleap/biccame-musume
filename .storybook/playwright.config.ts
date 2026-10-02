import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: ['review.spec.ts', 'catalogue.spec.ts', 'catalogue-interactions.spec.ts', 'catalogue-visual.spec.ts'],
  outputDir: './.artifacts/playwright',
  timeout: 30000,
  workers: 2,
  retries: 0,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:16006',
    browserName: 'chromium',
    serviceWorkers: 'block',
    launchOptions: { args: ['--no-sandbox'] },
    screenshot: 'only-on-failure'
  },
  webServer: {
    cwd: resolve(import.meta.dirname, '..'),
    command: process.env.STORYBOOK_CATALOGUE_BUILT
      ? 'bun .storybook/catalogue/serve.ts'
      : 'STORYBOOK_CATALOGUE_VERIFY=1 ./node_modules/.bin/storybook dev --port 16006 --host 127.0.0.1 --no-open --ci',
    url: 'http://127.0.0.1:16006',
    reuseExistingServer: !!process.env.STORYBOOK_CATALOGUE_EXISTING,
    timeout: 60000
  }
})
