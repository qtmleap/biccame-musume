import { defineConfig } from '@playwright/test'

const state = process.env.A15_VOTE_STATE
if (!state || !/^\.cache\/a15\/vote-state\.[A-Za-z0-9]+$/.test(state)) {
  throw new Error('Run vote coverage through bun run e2e:vote-limit to create disposable local state')
}
export default defineConfig({
  testDir: '..',
  testMatch: 'vote-limit.spec.ts',
  timeout: 30000,
  retries: 0,
  workers: 1,
  updateSnapshots: 'none',
  use: { baseURL: 'http://127.0.0.1:15302', extraHTTPHeaders: { Origin: 'http://127.0.0.1:15302' } },
  webServer: {
    command: `bunx wrangler dev --local --config e2e/vote-local/wrangler.toml --persist-to ${state} --port 15302 --ip 127.0.0.1`,
    cwd: process.cwd(),
    url: 'http://127.0.0.1:15302/health',
    reuseExistingServer: false,
    timeout: 120000
  }
})
