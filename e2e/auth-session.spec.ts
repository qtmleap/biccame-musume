import { expect, test } from '@playwright/test'
import { prepare } from './fixtures/auth-session-support'

test('account_switch_does_not_restore_previous_user_data', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-a')
  await expect(page.getByTestId('private-data')).toContainText('活動: account-a')
  await expect(page.getByTestId('private-data')).toContainText('バッジ: account-a')
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await page.waitForURL('/')
  await prepare(page)
  await page.getByRole('button', { name: 'Bでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-b')
  await expect(page.getByTestId('private-data')).toContainText('活動: account-b')
  await expect(page.getByTestId('private-data')).toContainText('バッジ: account-b')
  await expect(page.getByTestId('private-data')).not.toContainText('account-a')

  // Also cover an account replacement without navigation; fixed keys leaked here.
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-a')
  await expect(page.getByTestId('private-data')).toContainText('活動: account-a')
  await expect(page.getByTestId('private-data')).toContainText('バッジ: account-a')
  await expect(page.getByTestId('private-data')).not.toContainText('account-b')
})

test('logout_failure_keeps_retry_available', async ({ page }) => {
  await prepare(page, true)
  const initialUrl = page.url()
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByTestId('private-data')).toBeVisible()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('再試行できます')
  await expect(page.getByTestId('current-user')).toHaveText('account-a')
  await expect(page.getByTestId('private-data')).toContainText('account-a')
  await expect(page).toHaveURL(initialUrl)
  await page.route('**/api/auth/logout', (route) => route.fulfill({ json: { success: true } }))
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await page.waitForURL('/')
})

test('legacy persisted private data is removed before account B renders', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'REACT_QUERY_OFFLINE_CACHE',
      JSON.stringify({
        timestamp: Date.now(),
        buster: '',
        clientState: {
          mutations: [],
          queries: [
            { queryKey: ['me', 'favorites'], state: { data: { favorites: ['account-a'] } } },
            {
              queryKey: ['user_activities'],
              state: { data: { stores: ['account-a'], events: { interested: [], completed: [] } } }
            },
            {
              queryKey: ['me', 'badges'],
              state: { data: { earned: [{ code: 'account-a', earnedAt: '2026-10-02T00:00:00.000Z' }] } }
            }
          ]
        }
      })
    )
  })
  await prepare(page)
  await page.getByRole('button', { name: 'Bでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-b')
  await expect(page.getByTestId('private-data')).toContainText('活動: account-b')
  await expect(page.getByTestId('private-data')).toContainText('バッジ: account-b')
  await expect(page.getByTestId('private-data')).not.toContainText('account-a')
})

test('deferred account A mutations cannot update account B observers or caches', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('活動: account-a')
  const release = Promise.withResolvers<void>()
  const activityStarted = Promise.withResolvers<void>()
  const voteStarted = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const bulkStarted = Promise.withResolvers<void>()
  const bulkCompleted = Promise.withResolvers<void>()
  await page.route('**/api/me/stores/akiba', async (route) => {
    activityStarted.resolve()
    await release.promise
    await route.fulfill({ json: { success: true, newBadges: [] } })
  })
  await page.route('**/api/votes/private-account-a-vote', async (route) => {
    voteStarted.resolve()
    await release.promise
    await route.fulfill({
      json: { success: true, message: 'Aだけの投票応答', nextVoteDate: '2026-10-03', newBadges: [] }
    })
    completed.resolve()
  })
  await page.route('**/api/votes/bulk', async (route) => {
    bulkStarted.resolve()
    await release.promise
    await route.fulfill({
      json: {
        success: true,
        results: [{ characterId: 'private-account-a-bulk', status: 'voted' }],
        votedCount: 1,
        skippedCount: 0,
        nextVoteDate: '2026-10-03',
        newBadges: []
      }
    })
    bulkCompleted.resolve()
  })
  await page.getByRole('button', { name: '活動を追加' }).click()
  await activityStarted.promise
  await expect(page.getByTestId('activity-pending')).toHaveText('true')
  await page.getByRole('button', { name: '投票を追加', exact: true }).click()
  await voteStarted.promise
  await expect(page.getByTestId('vote-state')).toContainText('pending')
  await page.getByRole('button', { name: '一括投票を追加' }).click()
  await bulkStarted.promise
  await expect(page.getByTestId('bulk-state')).toContainText('private-account-a-bulk')
  await page.getByRole('button', { name: 'Bでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('活動: account-b')
  // Keeping these controls mounted must still reset the underlying mutation observation.
  await expect(page.getByTestId('activity-pending')).toHaveText('false')
  await expect(page.getByTestId('vote-state')).toHaveText('{"status":"idle"}')
  await expect(page.getByTestId('bulk-state')).toHaveText('{"status":"idle"}')
  const invalidations: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/'))
      invalidations.push(new URL(request.url()).pathname)
  })
  release.resolve()
  await Promise.all([completed.promise, bulkCompleted.promise])
  // Advance beyond both delayed badge-refetch callbacks, then allow fetch completion.
  await page.waitForTimeout(2800)
  await expect(page.getByTestId('activity-pending')).toHaveText('false')
  await expect(page.getByTestId('vote-state')).toHaveText('{"status":"idle"}')
  await expect(page.getByTestId('bulk-state')).toHaveText('{"status":"idle"}')
  await expect(page.getByTestId('private-data')).not.toContainText('account-a')
  expect(invalidations).toEqual([])
  const storedVotes = await page.evaluate(() => localStorage.getItem('biccame-last-vote-times'))
  expect(storedVotes).toBeNull()
  await expect(page.getByTestId('bulk-completion')).toHaveText('未完了')
})

test('current account mutation keeps normal results and completion callbacks', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('活動: account-a')
  await page.route('**/api/votes/bulk', (route) =>
    route.fulfill({
      json: {
        success: true,
        results: [{ characterId: 'private-account-a-bulk', status: 'voted' }],
        votedCount: 1,
        skippedCount: 0,
        nextVoteDate: '2026-10-03',
        newBadges: []
      }
    })
  )
  await page.getByRole('button', { name: '一括投票を追加' }).click()
  await expect(page.getByTestId('bulk-state')).toContainText('"status":"success"')
  await expect(page.getByTestId('bulk-state')).toContainText('"variables":["private-account-a-bulk"]')
  await expect(page.getByTestId('bulk-completion')).toHaveText('完了')
  const storedVotes = await page.evaluate(() => localStorage.getItem('biccame-last-vote-times'))
  expect(storedVotes).toContain('private-account-a-bulk')
})

test('same account completion still updates shared state after its controls unmount', async ({ page }) => {
  await prepare(page)
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByTestId('private-data')).toContainText('活動: account-a')
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  await page.route('**/api/votes/bulk', async (route) => {
    started.resolve()
    await release.promise
    await route.fulfill({
      json: {
        success: true,
        results: [{ characterId: 'private-account-a-bulk', status: 'voted' }],
        votedCount: 1,
        skippedCount: 0,
        nextVoteDate: '2026-10-03',
        newBadges: []
      }
    })
  })
  await page.getByRole('button', { name: '一括投票を追加' }).click()
  await started.promise
  await page.getByRole('button', { name: '操作を閉じる' }).click()
  await expect(page.getByTestId('bulk-state')).toHaveCount(0)
  release.resolve()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('biccame-last-vote-times')))
    .toContain('private-account-a-bulk')
})
