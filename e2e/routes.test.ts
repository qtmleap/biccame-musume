import { expect, test } from '@playwright/test'

const routes = [
  '/',
  '/location',
  '/events',
  '/about',
  '/ranking',
  '/characters',
  '/contact',
  '/calendar',
]

for (const route of routes) {
  test(`${route} は HTTP 200 を返す`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
  })
}

test('存在しないルートでも SPA フォールバックで 200 を返す', async ({ page }) => {
  const response = await page.goto('/this-does-not-exist', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
})
