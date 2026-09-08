import { defineConfig } from '@playwright/test'

// 開発用 dev サーバー (15175 とその周辺ポート) と併走できるよう E2E は離れたポートを使う。
// VOTE_LIMIT_BYPASS を落とした状態で起動する必要があるため既存サーバーは再利用しない。
const PORT = 15300
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'on',
    // CSRF 対策で Origin を見るため、API を直接叩くテスト向けに既定で付与する
    extraHTTPHeaders: { Origin: BASE_URL }
  },
  webServer: {
    command: 'bun run dev:e2e',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ]
})
