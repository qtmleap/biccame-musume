import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { chromium } from '@playwright/test'
import { events } from '../e2e/visual-typography/fixtures'

// devサーバーを起動せず、検証済みVite成果物をPlaywright routeでブラウザへ直接供給する。
const root = resolve(import.meta.dirname, '..')
const built = resolve(root, 'workers/app/dist/client')
const output = resolve(root, '.cache/bot-main-screens')
mkdirSync(output, { recursive: true })
const mime: Record<string, string> = {
  '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
}
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' })
try {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== 'app-under-test.local') return route.abort()
    if (url.pathname === '/cdn-cgi/access/get-identity') return route.fulfill({ json: { email: 'synthetic@example.invalid' } })
    if (url.pathname === '/api/events') return route.fulfill({ json: events })
    if (url.pathname === '/api/events/stats') return route.fulfill({ json: {} })
    if (url.pathname.startsWith('/api/events/')) return route.fulfill({ json: { ...events[0], referenceUrls: [], comments: [] } })
    if (url.pathname === '/api/event-groups') return route.fulfill({ json: [] })
    if (url.pathname === '/api/stats') return route.fulfill({ json: { today: 0, total: 0 } })
    if (url.pathname === '/api/votes') return route.fulfill({ json: [{ key: 'nagoyagate', count: 42 }] })
    if (url.pathname === '/api/admin/twitter/status') return route.fulfill({ json: {
      ok: false, account: null, error: 'Synthetic disabled bot status', fetchedAt: '2026-10-03T00:00:00Z'
    } })
    if (url.pathname === '/characters.json') return route.fulfill({ contentType: 'application/json', body: readFileSync(resolve(root, 'workers/app/public/characters.json')) })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { message: 'Unstubbed API blocked by offline test' } })
    if (url.pathname.startsWith('/images/characters/')) return route.fulfill({ contentType: 'image/webp', body: readFileSync(resolve(root, 'e2e/character-detail-layout/abeno.webp')) })
    const path = route.request().resourceType() === 'document' ? resolve(built, 'index.html') : resolve(built, `.${decodeURIComponent(url.pathname)}`)
    if (!path.startsWith(`${built}/`)) throw new Error('Asset path escaped build directory')
    try { return route.fulfill({ body: readFileSync(path), contentType: mime[extname(path)] ? mime[extname(path)] : 'application/octet-stream' }) }
    catch { return route.fulfill({ status: 404, body: 'Offline asset unavailable' }) }
  })
  const screens = [
    ['home', '/', '開催中・開催予定のイベント'],
    ['characters', '/characters', 'ビッカメ娘一覧'],
    ['character-detail', '/characters/abeno', 'あべのたん'],
    ['events', '/events', 'イベント一覧'],
    ['calendar', '/calendar', '2026年10月'],
    ['location', '/location', '地図'],
    ['admin', '/admin', '管理画面'],
    ['admin-twitter', '/admin/twitter', 'Twitter 連携']
  ]
  for (const [name, path, expected] of screens) {
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.clock.setFixedTime(Date.parse('2026-10-03T00:00:00Z'))
    await page.goto(`http://app-under-test.local${path}`, { waitUntil: 'networkidle' })
    if (name === 'location') await page.getByRole('region', { name: '地図', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
    else await page.getByText(expected, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 })
    if (errors.length) throw new Error(`Page JavaScript failed: ${name}: ${errors.join(';')}`)
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true })
    console.log(`PASS ${name} ${path}`)
    await page.close()
  }
} finally { await context.close(); await browser.close() }
