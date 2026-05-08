import sharp from 'sharp'
import { test } from '@playwright/test'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

const routes = [
  '/',
  '/events',
  '/events/604a9f1a-b9ad-457c-b794-4882939e1fe4',
  '/calendar',
  '/me',
  '/contact',
  '/about',
  '/ranking',
]

const safeName = (route: string) => (route === '/' ? 'home' : route.replaceAll('/', '_').replace(/^_/, ''))

const capture = async (page: import('@playwright/test').Page, route: string, viewport: 'mobile' | 'desktop') => {
  await page.goto(route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const buf = await page.screenshot({ fullPage: true, type: 'png' })
  await sharp(buf)
    .webp({ quality: 85 })
    .toFile(`e2e/__screenshots__/visual-${safeName(route)}-${viewport}.webp`)
}

for (const route of routes) {
  test(`mobile ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await capture(page, route, 'mobile')
  })

  test(`desktop ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await capture(page, route, 'desktop')
  })
}
