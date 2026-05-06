import sharp from 'sharp'
import { test, expect } from '@playwright/test'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

async function login(page: import('@playwright/test').Page) {
  await page.goto('http://localhost:15175/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // ヘッダーの「ログイン」ボタンをクリック
  await page.getByRole('button', { name: 'ログイン' }).first().click()
  await page.waitForTimeout(500)

  // ダイアログが開くのを待つ
  await page.waitForSelector('#login-email', { state: 'visible' })

  await page.fill('#login-email', 'algae.olive.14@example.com')
  await page.fill('#login-password', '123456')

  // ログインボタン（フォーム内の送信ボタン）をクリック
  await page.locator('form').getByRole('button', { name: 'ログイン' }).click()

  // ログイン完了待ち（ダイアログが閉じる）
  await page.waitForSelector('#login-email', { state: 'hidden', timeout: 10000 })
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
  await page.setViewportSize({ width: 375, height: 800 })
  await login(page)

  await capture(page, '/badges', 'badges-layout-mobile.webp')
  await capture(page, '/events', 'compare-events-mobile.webp')
  await capture(page, '/characters', 'compare-characters-mobile.webp')
})

test('badges layout - desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)

  await capture(page, '/badges', 'badges-layout-desktop.webp')
  await capture(page, '/events', 'compare-events-desktop.webp')
  await capture(page, '/characters', 'compare-characters-desktop.webp')
})
