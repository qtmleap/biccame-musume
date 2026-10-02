import { expect, type Page, test } from '@playwright/test'

const pageErrors = new WeakMap<Page, string[]>()

const event = {
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  category: 'ackey',
  title: 'JST最終日のイベント',
  stores: ['sapporo'],
  startDate: '2026-12-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
  isVerified: true,
  isPreliminary: false,
  conditions: [],
  status: 'last_day',
  daysUntil: 0,
  interestedCount: 0,
  completedCount: 0,
  createdAt: '2026-12-01T00:00:00.000Z',
  updatedAt: '2026-12-01T00:00:00.000Z'
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  let rankingReads = 0
  await page.clock.install({ time: new Date('2026-12-31T14:59:50.000Z') })
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('event-view-mode', JSON.stringify('grid'))
    localStorage.setItem(
      'biccame-last-vote-times',
      JSON.stringify({
        sapporo: '2026-12-31T03:00:00.000Z',
        akiba: '2026-12-31T03:00:00.000Z'
      })
    )
  })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:15307') return route.abort()
    if (url.pathname === '/api/events') return route.fulfill({ json: [event] })
    if (url.pathname === '/api/event-groups') return route.fulfill({ json: [] })
    if (url.pathname === '/api/votes') {
      rankingReads += 1
      return route.fulfill({ json: [{ key: 'sapporo', count: rankingReads === 1 ? 41 : 1 }] })
    }
    if (url.pathname.startsWith('/api/votes/')) {
      return route.fulfill({
        json: url.pathname.endsWith('/bulk')
          ? {
              success: true,
              nextVoteDate: '2027-01-02',
              newBadges: [],
              votedCount: 1,
              skippedCount: 1,
              results: [
                { characterId: 'sapporo', status: 'skipped' },
                { characterId: 'akiba', status: 'voted' }
              ]
            }
          : { success: true, message: '応援ありがとう！', nextVoteDate: '2027-01-01T15:00:00.000Z', newBadges: [] }
      })
    }
    if (url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })
  await page.goto('/e2e/date-boundary/index.html')
  await expect(page.getByRole('heading', { name: 'イベント一覧' })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-12-31T14:59:59.000Z'))
})

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
})

test('utc_device_vote_unlocks_at_jst_midnight', async ({ page }) => {
  const single = page.getByRole('region', { name: '個別投票' }).getByRole('button')
  const bulk = page.getByRole('region', { name: '一括投票' }).getByRole('button')
  await expect(single).toHaveAttribute('aria-disabled', 'true')
  await expect(bulk).toBeDisabled()
  await page.clock.runFor(1001)
  await expect(single).toHaveAttribute('aria-disabled', 'false')
  await expect(bulk).toBeEnabled()
  // HTTP応答後のQuery通知はsetTimeout(0)を使うため、境界確認後は時計を再開する。
  await page.clock.resume()
  const response = page.waitForResponse('**/api/votes/sapporo')
  await single.click()
  expect((await response).status()).toBe(200)
  await expect(single).toHaveAttribute('aria-disabled', 'true')
  const bulkResponse = page.waitForResponse('**/api/votes/bulk')
  await bulk.click()
  expect((await bulkResponse).status()).toBe(200)
  await expect(bulk).toHaveText('本日は投票済み')
  await expect(bulk).toBeDisabled()
})

test('last_day_becomes_ended_after_midnight', async ({ page }) => {
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible()
  await page.clock.runFor(1001)
  await expect(page.getByRole('heading', { name: event.title })).toHaveCount(0)
  await page.locator('#status-ended').last().click()
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible()
})

test('visibility_refreshes_date_after_sleep', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2027-01-02T00:00:00.000Z'))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('region', { name: '一括投票' }).getByRole('button')).toBeEnabled()
  await expect(page.getByRole('heading', { name: event.title })).toHaveCount(0)
})

test('ranking_refreshes_at_jst_new_year', async ({ page }) => {
  await expect(page.getByLabel('札幌の得票数')).toHaveText('41')
  await page.clock.runFor(1001)
  await page.clock.resume()
  await expect(page.getByLabel('札幌の得票数')).toHaveText('1')
})
