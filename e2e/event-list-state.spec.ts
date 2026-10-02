import { expect, test } from '@playwright/test'

const events = Array.from({ length: 13 }, (_, i) => ({
  uuid: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
  category: 'ackey',
  title: `イベント${i + 1}`,
  stores: ['sapporo'],
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2099-12-31T00:00:00.000Z',
  isVerified: true,
  isPreliminary: false,
  conditions: [],
  status: 'ongoing',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}))
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('event-view-mode', JSON.stringify('grid'))
  })
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15308') return route.abort()
    if (url.pathname === '/api/events') return route.fulfill({ json: events })
    if (url.pathname === '/api/event-groups') return route.fulfill({ json: [] })
    if (url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })
})
test('shrinking_results_clamps_page', async ({ page }) => {
  await page.goto(`/e2e/event-state/index.html?path=/grid&events=${encodeURIComponent(JSON.stringify(events))}`)
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await page.getByRole('button', { name: '13件から12件へ' }).click()
  await expect(page.getByText('全 12 件中 1–12 件を表示')).toBeVisible()
  await expect(page.getByLabel('グリッド所有ページ')).toHaveText('1')
  await expect(page.getByText('13–12', { exact: false })).toHaveCount(0)
})
test('events_owner_page_clamps_when_refetch_shrinks', async ({ page }) => {
  await page.goto('/e2e/event-state/index.html')
  await expect(page.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
  await page.getByRole('link', { name: '2', exact: true }).click()
  await page.route('**/api/events', (route) => route.fulfill({ json: events.slice(0, 12) }))
  await page.getByRole('button', { name: '一覧再取得' }).click()
  await expect(page.getByText('全 12 件中 1–12 件を表示')).toBeVisible()
  await expect(page.getByLabel('所有ページ', { exact: true })).toHaveText('1')
})
for (const mode of ['grid', 'gantt'])
  test(`filtered_empty_state_offers_reset_${mode}`, async ({ page }) => {
    await page.addInitScript((viewMode) => localStorage.setItem('event-view-mode', JSON.stringify(viewMode)), mode)
    await page.goto('/e2e/event-state/index.html?path=/events/?store=missing')
    await expect(page.getByText('条件に一致するイベントはありません')).toBeVisible()
    await page.getByRole('button', { name: '条件を解除', exact: true }).click()
    await expect(page.getByText('条件に一致するイベントはありません')).toHaveCount(0)
    await expect(page.getByText('イベント1', { exact: true }).first()).toBeVisible()
  })

const manyEvents = [
  ...events,
  ...Array.from({ length: 47 }, (_, i) => ({
    ...events[0],
    uuid: `550e8400-e29b-41d4-a716-${String(i + 13).padStart(12, '0')}`,
    title: `イベント${i + 14}`,
    category: 'other'
  }))
]

test('filter_change_resets_page_before_clamping', async ({ page }) => {
  await page.route('**/api/events', (route) => route.fulfill({ json: manyEvents }))
  await page.goto('/e2e/event-state/index.html')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await page.getByRole('link', { name: '5', exact: true }).click()
  await expect(page.getByLabel('所有ページ', { exact: true })).toHaveText('5')
  await page.locator('#category-other').last().click()
  await expect(page.getByText('全 13 件中 1–12 件を表示')).toBeVisible()
  await expect(page.getByLabel('所有ページ', { exact: true })).toHaveText('1')
})

test('refetch_only_clamps_page_to_last_remaining_page', async ({ page }) => {
  await page.route('**/api/events', (route) => route.fulfill({ json: manyEvents }))
  await page.goto('/e2e/event-state/index.html')
  await expect(page.getByText('全 60 件中 1–12 件を表示')).toBeVisible()
  await page.getByRole('link', { name: '5', exact: true }).click()
  await expect(page.getByLabel('所有ページ', { exact: true })).toHaveText('5')
  await page.route('**/api/events', (route) => route.fulfill({ json: events }))
  await page.getByRole('button', { name: '一覧再取得' }).click()
  await expect(page.getByText('全 13 件中 13–13 件を表示')).toBeVisible()
  await expect(page.getByLabel('所有ページ', { exact: true })).toHaveText('2')
})
