import { expect, type Page, test } from '@playwright/test'

const readState = async (page: Page) => JSON.parse(await page.getByTestId('map-state').innerText())
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
  )
  await page.goto('/location/')
  await expect(page.getByTestId('map-state')).toContainText('139.7671')
})
test('missing_coordinate_has_no_marker', async ({ page }) => {
  await expect(page.getByTestId('marker')).toHaveCount(4)
  await expect(page.getByTestId('marker').nth(0)).toHaveAttribute('data-position', '{"lat":34.7,"lng":135.5}')
  await expect(page.getByTestId('marker').nth(1)).toHaveAttribute('data-position', '{"lat":-90,"lng":180}')
  await expect(page.getByTestId('marker').nth(2)).toHaveAttribute('data-position', '{"lat":90,"lng":-180}')
  await expect(page.getByTestId('marker').nth(3)).toHaveAttribute('data-position', '{"lat":0,"lng":0}')
})
test('missing_coordinate_remains_in_list', async ({ page }) => {
  await page.getByRole('button', { name: '店舗一覧', exact: true }).click()
  for (let i = 0; i < 10; i++) {
    const row = page.getByRole('button', { name: `未登録店舗invalid-${i}`, exact: false })
    await expect(row).toBeVisible()
    await expect(row).toContainText('地図位置未登録')
    await expect(row).not.toContainText(/NaN|Infinity|km|\d+m/)
  }
  await expect(page.getByRole('button', { name: /有効店舗/ })).toContainText('km')
})
test('select_missing_coordinate_does_not_pan', async ({ page }) => {
  await page.getByTestId('marker').first().click()
  const previous = await readState(page)
  expect(previous).toEqual({ center: { lat: 34.7, lng: 135.5 }, zoom: 17, pans: 1, zooms: 1 })
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: '店舗一覧', exact: true }).click()
    await page.getByRole('button', { name: `未登録店舗invalid-${i}`, exact: false }).click()
    expect(await readState(page)).toEqual(previous)
    await expect(page.getByRole('link', { name: new RegExp(`未登録店舗invalid-${i}`) })).toContainText('地図位置未登録')
  }
})
test('initial_missing_selection_uses_default_center_and_zoom', async ({ page }) => {
  await page.goto('/location/?id=invalid-0')
  await expect(page.getByTestId('map-state')).toContainText('139.7671')
  expect(await readState(page)).toEqual({ center: { lat: 35.6812, lng: 139.7671 }, zoom: 5, pans: 0, zooms: 0 })
  await expect(page.getByRole('link', { name: /未登録店舗invalid-0/ })).toContainText('地図位置未登録')
})
