import sharp from 'sharp'
import { test } from '@playwright/test'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

async function login(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('http://localhost:15175/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // ヘッダーの「ログイン」ボタン（デスクトップナビ内）
  const loginBtn = page.locator('header nav').getByRole('button', { name: 'ログイン' })
  await loginBtn.waitFor({ state: 'visible', timeout: 10000 })
  await loginBtn.click()

  // ダイアログが開くのを待つ
  await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 10000 })
  await page.waitForSelector('#login-email', { state: 'visible', timeout: 5000 })

  await page.fill('#login-email', 'algae.olive.14@example.com')
  await page.fill('#login-password', '123456')

  // フォームを submit - ボタンテキストを確認してから
  const submitBtn = page.locator('[role="dialog"] form').getByRole('button', { name: /ログイン/ })
  await submitBtn.waitFor({ state: 'visible', timeout: 5000 })
  console.log('submit button disabled?', await submitBtn.isDisabled())
  await submitBtn.click()

  // エラーが出ていないか確認しながら待つ
  await page.waitForTimeout(5000)
  if (errors.length > 0) {
    console.log('Login errors:', errors)
  }

  // ダイアログが閉じたか確認
  const dialogVisible = await page.locator('[role="dialog"]').isVisible()
  console.log('Dialog still visible after login:', dialogVisible)
}

async function capture(
  page: import('@playwright/test').Page,
  route: string,
  filename: string,
) {
  await page.goto(`http://localhost:15175${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  const buf = await page.screenshot({ fullPage: true, type: 'png' })
  await sharp(buf).webp({ quality: 85 }).toFile(`e2e/__screenshots__/${filename}`)
}

test.setTimeout(120000)

// デバッグ用: ログインフローのみ
test('debug login', async ({ page }) => {
  await login(page)

  // ログイン後のスクショ
  await page.screenshot({ path: 'e2e/__screenshots__/debug-after-login.png' })
})
