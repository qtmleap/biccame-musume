import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })
test.setTimeout(60_000)

const successfulStatus = () => ({
  ok: true,
  account: {
    restId: '123456789',
    screenName: 'status_regression',
    name: 'Previously authenticated account',
    followersCount: 12,
    friendsCount: 3,
    statusesCount: 45,
    favouritesCount: 6,
    listedCount: 1,
    mediaCount: 7,
    createdAt: 'Wed Oct 10 20:19:24 +0000 2018',
    profileImageUrl: '',
    profileBannerUrl: null,
    description: 'Authentication status regression fixture'
  },
  error: null,
  fetchedAt: new Date().toISOString()
})

const failedStatus = () => ({
  ok: false,
  account: null,
  error: 'Authentication credentials have expired',
  fetchedAt: new Date().toISOString()
})

test('reopening Twitter admin within a minute checks credentials again', async ({ page }) => {
  let requests = 0
  await page.route('**/api/admin/twitter/status', async (route) => {
    requests += 1
    await route.fulfill({ json: requests === 1 ? successfulStatus() : failedStatus() })
  })

  await page.goto('/admin/twitter', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Previously authenticated account' })).toBeVisible({ timeout: 30_000 })
  const openedAt = Date.now()
  await page.getByRole('link', { name: '管理画面に戻る' }).click()
  await expect(page).toHaveURL(/\/admin\/?$/)
  await expect(page.getByRole('heading', { name: '管理画面', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.locator('a[href="/admin/twitter"], a[href="/admin/twitter/"]').click()

  await expect(page.getByText('Authentication credentials have expired', { exact: true })).toBeVisible()
  expect(requests).toBe(2)
  expect(Date.now() - openedAt).toBeLessThan(60_000)
  await expect(page.getByRole('heading', { name: 'Previously authenticated account' })).toHaveCount(0)
})

test('reload ignores persisted successful status and hides it while checking credentials', async ({ page }) => {
  let requests = 0
  let releaseFailure: () => void = () => {}
  const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve })
  await page.route('**/api/admin/twitter/status', async (route) => {
    requests += 1
    if (requests === 1) {
      await route.fulfill({ json: successfulStatus() })
      return
    }
    await failureGate
    await route.fulfill({ json: failedStatus() })
  })

  await page.goto('/admin/twitter', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Previously authenticated account' })).toBeVisible({ timeout: 30_000 })
  // Seed the format saved by older app versions, keeping the app's current version marker.
  await page.evaluate((data) => {
    const now = Date.now()
    localStorage.setItem('REACT_QUERY_OFFLINE_CACHE', JSON.stringify({
      timestamp: now,
      buster: '',
      clientState: {
        mutations: [],
        queries: [{
          queryKey: ['admin', 'twitter', 'status'],
          queryHash: '["admin","twitter","status"]',
          state: {
            data, dataUpdateCount: 1, dataUpdatedAt: now,
            error: null, errorUpdateCount: 0, errorUpdatedAt: 0,
            fetchFailureCount: 0, fetchFailureReason: null, fetchMeta: null,
            isInvalidated: false, status: 'success', fetchStatus: 'idle'
          }
        }]
      }
    }))
  }, successfulStatus())

  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => requests).toBe(2)
    await expect(page.getByRole('heading', { name: 'Previously authenticated account' })).toHaveCount(0)
  } finally {
    releaseFailure()
  }
  await expect(page.getByText('Authentication credentials have expired', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('REACT_QUERY_OFFLINE_CACHE') ?? 'null')
    return cache?.clientState?.queries?.some((query: { queryKey: string[] }) =>
      JSON.stringify(query.queryKey) === '["admin","twitter","status"]') ?? false
  })).toBe(false)
})
