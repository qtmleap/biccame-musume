import { test } from '@playwright/test'
import sharp from 'sharp'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

const route = '/admin/events/604a9f1a-b9ad-457c-b794-4882939e1fe4'

const capture = async (page: import('@playwright/test').Page, viewport: 'mobile' | 'desktop') => {
  await page.goto(route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const buf = await page.screenshot({ fullPage: true, type: 'png' })
  await sharp(buf)
    .webp({ quality: 85 })
    .toFile(`e2e/__screenshots__/admin-event-edit-${viewport}.webp`)
}

test('mobile admin event edit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await capture(page, 'mobile')
})

test('desktop admin event edit', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await capture(page, 'desktop')
})
