#!/usr/bin/env bun
/**
 * ビルド後にPlaywrightを使ってプリレンダリングするスクリプト
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '../dist/client')
const PORT = 4173

// プリレンダリング対象のルート
const ROUTES = [
  '/',
  '/about',
  '/calendar',
  '/characters',
  '/contact',
  '/location',
  '/ranking'
]

/**
 * ローカルサーバーを起動
 */
const startServer = async () => {
  const { spawn } = await import('node:child_process')
  const server = spawn('bun', ['run', 'preview'], {
    cwd: join(__dirname, '..'),
    stdio: 'pipe'
  })

  // サーバーが起動するまで待機
  await new Promise<void>((resolve) => {
    server.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      console.log('Server:', output)
      if (output.includes('Local:') || output.includes('localhost')) {
        resolve()
      }
    })
    // タイムアウト（5秒）
    setTimeout(resolve, 5000)
  })

  return server
}

/**
 * ページをプリレンダリング
 */
const prerenderPage = async (
  browser: Browser,
  route: string
): Promise<{ route: string; html: string }> => {
  const page = await browser.newPage()
  const url = `http://localhost:${PORT}${route}`

  console.log(`Prerendering: ${route}`)

  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    })

    // Suspenseが解決するまで待機
    await page.waitForFunction(
      () => {
        const loading = document.querySelector('[class*="animate-spin"]')
        return !loading
      },
      { timeout: 10000 }
    ).catch(() => {
      console.warn(`Warning: Loading indicator still present for ${route}`)
    })

    // 追加の待機（レンダリング安定化）
    await new Promise((resolve) => setTimeout(resolve, 500))

    const html = await page.content()
    await page.close()

    return { route, html }
  } catch (error) {
    console.error(`Failed to prerender ${route}:`, error)
    await page.close()
    throw error
  }
}

/**
 * HTMLをファイルに保存
 */
const saveHtml = (route: string, html: string) => {
  const filePath = route === '/'
    ? join(DIST_DIR, 'index.html')
    : join(DIST_DIR, route, 'index.html')

  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(filePath, html, 'utf-8')
  console.log(`Saved: ${filePath}`)
}

/**
 * メイン処理
 */
const main = async () => {
  console.log('Starting prerender process...')

  // distディレクトリが存在するか確認
  if (!existsSync(DIST_DIR)) {
    console.error('Error: dist/client directory not found. Run build first.')
    process.exit(1)
  }

  // サーバー起動
  console.log('Starting preview server...')
  const server = await startServer()

  try {
    // Playwright起動
    const browser = await chromium.launch({
      headless: true
    })

    // 各ルートをプリレンダリング
    for (const route of ROUTES) {
      try {
        const { html } = await prerenderPage(browser, route)
        saveHtml(route, html)
      } catch (error) {
        console.error(`Skipping ${route} due to error`)
      }
    }

    await browser.close()
    console.log('Prerendering complete!')
  } finally {
    // サーバー停止
    server.kill()
  }
}

main().catch((error) => {
  console.error('Prerender failed:', error)
  process.exit(1)
})
