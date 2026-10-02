import { expect, test } from '@playwright/test'
import { prepare, screens } from './local/support'
import { assertHealthyScreen } from './regression/guards'

test.beforeEach(async ({ page }) => prepare(page))
for (const [route, heading, role] of screens)
  test(`${route} renders its expected public or guest state`, async ({ page }) => {
    expect((await page.goto(route))?.status()).toBe(200)
    await assertHealthyScreen(page, heading, role)
    if (route === '/me') await expect(page).toHaveURL('/')
    await expect(page.getByRole('banner')).toBeVisible()
  })
test('unknown route renders the honest not-found screen', async ({ page }) => {
  expect((await page.goto('/this-does-not-exist'))?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'ページが見つかりませんでした' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'トップページに戻る', exact: true })).toBeVisible()
})
test('events view controls change the expected display', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/events')
  await assertHealthyScreen(page, 'イベント一覧')
  await page.getByRole('button', { name: '日程', exact: true }).click()
  await expect(page.getByRole('region', { name: 'ガントチャートスクロールエリア' })).toBeVisible()
  await page.getByRole('button', { name: '一覧', exact: true }).click()
  await expect(page.getByRole('region', { name: 'ガントチャートスクロールエリア' })).toHaveCount(0)
})
