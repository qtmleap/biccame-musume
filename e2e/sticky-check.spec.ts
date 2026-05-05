import sharp from 'sharp'
import { test } from '@playwright/test'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

test('events gantt date header sticky', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/events', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollBy(0, 400))
  await page.waitForTimeout(300)
  const buf = await page.screenshot({ type: 'png' })
  await sharp(buf).webp({ quality: 85 }).toFile('e2e/__screenshots__/visual-events-mobile-scrolled.webp')
})
