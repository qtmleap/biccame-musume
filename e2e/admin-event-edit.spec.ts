import { expect, test } from '@playwright/test'
import sharp from 'sharp'

test.use({
  serviceWorkers: 'block',
  deviceScaleFactor: 2,
})

const eventUuid = '604a9f1a-b9ad-457c-b794-4882939e1fe4'
const route = `/admin/events/${eventUuid}`

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

test('admin event update: BACK does not return to the stale edit form', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${route}/edit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: '確認する' }).click()
  await page.getByRole('button', { name: '更新する' }).click()

  await page.waitForURL(/\/admin\/events\/?$/, { timeout: 10000 })
  await expect(page).toHaveURL(/\/admin\/events\/?$/)

  await page.goBack()
  await expect(page).not.toHaveURL(/\/admin\/events\/[0-9a-f-]+\/edit\/?$/)
})

test('admin event create: BACK from edit page lands on admin list, not public detail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto(`/events/${eventUuid}`, { waitUntil: 'networkidle' })
  await expect(page).toHaveURL(new RegExp(`/events/${eventUuid}`))

  await page.goto('/admin/events/new', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(/\/admin\/events\/new\/?$/)

  await page.goBack()
  const url = page.url()
  const isPublicEvent = /\/events\/[0-9a-f-]+(\/?|\?.*)?$/.test(url) && !url.includes('/admin/')
  if (isPublicEvent) {
    throw new Error(
      `BACK leaked to public event page ${url}. handleSuccess の history.replace が効いていない可能性`,
    )
  }
})
