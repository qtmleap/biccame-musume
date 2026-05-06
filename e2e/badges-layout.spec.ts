import sharp from 'sharp'
import { test } from '@playwright/test'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

async function login(page: import('@playwright/test').Page) {
  // デスクトップ幅でログイン操作（ヘッダーにログインボタンが表示される）
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('http://localhost:15175/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // ヘッダーの「ログイン」ボタン（type=button）をクリック
  // デスクトップヘッダーの LoginButton は nav.hidden.md:flex の中にある
  await page.locator('nav').getByRole('button', { name: 'ログイン' }).click()
  await page.waitForTimeout(500)

  // ダイアログが開くのを待つ
  await page.waitForSelector('#login-email', { state: 'visible' })

  await page.fill('#login-email', 'algae.olive.14@example.com')
  await page.fill('#login-password', '123456')

  // ダイアログ内のログインフォームのサブミットボタン
  // ログインタブのフォーム内 button[type=submit]
  await page.locator('[role="dialog"] form button[type="submit"]').click()

  // ダイアログが閉じるまで待つ（最大10秒）
  await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(2000)
}

async function capture(
  page: import('@playwright/test').Page,
  route: string,
  filename: string,
) {
  await page.goto(`http://localhost:15175${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const buf = await page.screenshot({ fullPage: true, type: 'png' })
  await sharp(buf).webp({ quality: 85 }).toFile(`e2e/__screenshots__/${filename}`)
}

test('badges layout - mobile', async ({ page }) => {
  await login(page)

  // ログイン状態でモバイルに切り替え
  await page.setViewportSize({ width: 375, height: 800 })

  await capture(page, '/badges', 'badges-layout-mobile.webp')
  await capture(page, '/events', 'compare-events-mobile.webp')
  await capture(page, '/characters', 'compare-characters-mobile.webp')
})

test('badges layout - desktop', async ({ page }) => {
  await login(page)

  // デスクトップサイズはそのまま
  await page.setViewportSize({ width: 1280, height: 900 })

  await capture(page, '/badges', 'badges-layout-desktop.webp')
  await capture(page, '/events', 'compare-events-desktop.webp')
  await capture(page, '/characters', 'compare-characters-desktop.webp')
})
