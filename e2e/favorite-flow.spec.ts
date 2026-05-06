import { writeFile, mkdir } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('キャラクター詳細 お気に入りフロー', async ({ page }) => {
  // (1) トップページを開いてログイン
  await page.goto('/', { waitUntil: 'networkidle' })

  // ログインボタンをクリックしてダイアログを開く
  await page.getByRole('button', { name: 'ログイン' }).click()

  // ダイアログが出るまで待つ
  await page.locator('#login-email').waitFor({ state: 'visible' })
  await page.locator('#login-email').fill('algae.olive.14@example.com')
  await page.locator('#login-password').fill('123456')
  await page.getByRole('button', { name: 'ログイン' }).click()

  // ログイン完了を待つ（ダイアログが消えるまで）
  await page.locator('#login-email').waitFor({ state: 'hidden' })

  // (2) キャラクター詳細ページへ
  await page.goto('/characters/abeno', { waitUntil: 'networkidle' })

  // お気に入りボタンが表示されるまで待つ
  const favoriteBtn = page.locator('button[aria-label="お気に入り登録"]')
  await favoriteBtn.waitFor({ state: 'visible', timeout: 10000 })

  // お気に入りが既に登録済みの場合は解除してリセット
  const alreadyFavored = await page.locator('button[aria-label="お気に入り解除"]').isVisible()
  if (alreadyFavored) {
    await page.locator('button[aria-label="お気に入り解除"]').click()
    await page.locator('button[aria-label="お気に入り登録"]').waitFor({ state: 'visible', timeout: 5000 })
  }

  // (3) お気に入りボタンをクリック
  await favoriteBtn.click()

  // バーストをキャプチャ（click 直後）
  const buf = await page.screenshot({ fullPage: false })
  try {
    const sharp = (await import('sharp')).default
    await mkdir('e2e/__screenshots__', { recursive: true })
    const webp = await sharp(buf).webp({ quality: 80 }).toBuffer()
    await writeFile('e2e/__screenshots__/favorite-burst.webp', webp)
  } catch {
    await page.screenshot({ path: 'e2e/__screenshots__/favorite-burst.png' })
  }

  // (2) toast「あべのたんを神推し！」が表示されること
  await expect(page.getByText('あべのたんを神推し！')).toBeVisible({ timeout: 5000 })

  // (1) ボタンが favored 状態（aria-pressed="true" / aria-label="お気に入り解除"）に変わること
  await expect(page.locator('button[aria-label="お気に入り解除"]')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('button[aria-label="お気に入り解除"]')).toHaveAttribute('aria-pressed', 'true')
})
