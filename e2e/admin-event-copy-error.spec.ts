import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15308') return route.abort()
    if (url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })
})
for (const failure of ['500', 'network'])
  test(`optional_event_${failure}_does_not_return_null`, async ({ page }) => {
    await page.route('**/api/events/550e8400-e29b-41d4-a716-446655440000', (route) =>
      failure === 'network' ? route.abort() : route.fulfill({ status: 500, json: { message: 'failed' } })
    )
    await page.goto('/e2e/event-state/index.html?path=/admin/events/new/?from=550e8400-e29b-41d4-a716-446655440000')
    await expect(page.getByText('コピー元イベントの取得に失敗しました')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'イベント新規登録' })).toHaveCount(0)
    await page.route('**/api/events/550e8400-e29b-41d4-a716-446655440000', (route) =>
      route.fulfill({ status: 404, json: { message: 'not found' } })
    )
    await page.getByRole('button', { name: '再試行' }).click()
    await expect(page.getByText('コピー元イベントが見つかりません')).toBeVisible()
  })
test('optional_404_returns_null_and_detail_cache_is_isolated', async ({ page }) => {
  let reads = 0
  await page.route('**/api/events/missing', (route) => {
    reads++
    return route.fulfill({ status: 404, json: { message: 'not found' } })
  })
  await page.goto('/e2e/event-state/index.html?path=/cache')
  await expect(page.getByText('optional null')).toBeVisible()
  await page.getByRole('button', { name: 'キャッシュ確認' }).click()
  await expect(page.getByText('isolated')).toBeVisible()
  await page.getByRole('button', { name: '詳細へ' }).click()
  await expect(page.getByText('detail null')).toHaveCount(0)
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2)
})
