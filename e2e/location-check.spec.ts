import sharp from 'sharp'
import { test } from '@playwright/test'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

const capture = async (page: import('@playwright/test').Page, viewport: 'mobile' | 'desktop') => {
  page.on('console', (msg) => console.log(`[${viewport}/console/${msg.type()}]`, msg.text()))
  page.on('pageerror', (err) => console.log(`[${viewport}/pageerror]`, err.message))
  await page.goto('/location', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const gmCanvas = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="地図"]')
    return {
      sectionChildrenCount: section?.children.length ?? 0,
      sectionInnerHTMLLen: section?.innerHTML.length ?? 0,
      mapDiv: section?.querySelector('[aria-label="マップ"], [role="region"], div[style*="position"]')?.tagName,
      gmReady: typeof window.google !== 'undefined' && typeof window.google.maps !== 'undefined',
    }
  })
  console.log(`[${viewport}] gmCanvas:`, JSON.stringify(gmCanvas))

  const measurements = await page.evaluate(() => {
    const main = document.querySelector('main')
    const section = document.querySelector('section[aria-label="地図"]')
    const footer = document.querySelector('footer')
    const header = document.querySelector('header')
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: header?.getBoundingClientRect(),
      main: main?.getBoundingClientRect(),
      section: section?.getBoundingClientRect(),
      footer: footer?.getBoundingClientRect(),
    }
  })
  console.log(`[${viewport}] measurements:`, JSON.stringify(measurements, null, 2))

  const buf = await page.screenshot({ fullPage: false, type: 'png' })
  await sharp(buf)
    .webp({ quality: 85 })
    .toFile(`e2e/__screenshots__/location-check-${viewport}.webp`)
}

test('mobile /location', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await capture(page, 'mobile')
})

test('desktop /location', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await capture(page, 'desktop')
})
