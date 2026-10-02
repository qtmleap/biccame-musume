import { expect, type Page, test } from '@playwright/test'

// Only Firebase's external SDK boundary is replaced; hooks and AuthProvider remain real.
const firebaseStub = `
export const auth = globalThis.__testFirebaseAuth ??= { currentUser: null, listeners: new Set() };
export const getRedirectResult = async () => null;
export const onAuthStateChanged = (_, callback) => {
  auth.listeners.add(callback); queueMicrotask(() => callback(auth.currentUser));
  return () => auth.listeners.delete(callback);
};
export const signInWithEmailAndPassword = async (_, uid) => {
  auth.currentUser = { uid, email: uid, getIdToken: async () => uid };
  for (const callback of auth.listeners) callback(auth.currentUser);
  return { user: auth.currentUser };
};
export const signOut = async () => {
  auth.currentUser = null;
  for (const callback of auth.listeners) callback(null);
};
export const createUserWithEmailAndPassword = signInWithEmailAndPassword;
export const signInWithRedirect = async () => {};
export class GithubAuthProvider {};
export class GoogleAuthProvider {};
export class OAuthProvider {};
export class TwitterAuthProvider {};
`

const prepare = async (page: Page, failLogout = false) => {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.host !== 'localhost:15300') return route.abort()
    if (url.pathname === '/src/lib/firebase.ts') {
      return route.fulfill({
        contentType: 'text/javascript',
        body: "export { auth } from '/node_modules/.vite/deps/firebase_auth.js';"
      })
    }
    if (url.pathname.endsWith('/firebase_auth.js'))
      return route.fulfill({ contentType: 'text/javascript', body: firebaseStub })
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/auth/logout') {
      return route.fulfill({ status: failLogout ? 503 : 200, json: { success: !failLogout } })
    }
    if (url.pathname === '/api/auth') return route.fulfill({ json: { success: true } })
    const uid = await page.getByTestId('current-user').textContent()
    const value = uid === 'account-a' ? 'account-a' : 'account-b'
    if (url.pathname.endsWith('/favorites')) return route.fulfill({ json: { favorites: [value] } })
    if (url.pathname.endsWith('/activities'))
      return route.fulfill({ json: { stores: [value], events: { interested: [], completed: [] } } })
    if (url.pathname === '/api/users/me/badges')
      return route.fulfill({ json: { earned: [{ code: value, earnedAt: '2026-10-02T00:00:00.000Z' }] } })
    if (url.pathname === '/api/badges') return route.fulfill({ json: { badges: [] } })
    return route.fulfill({ status: 404, json: { message: 'Unstubbed API request' } })
  })
  await page.goto('/e2e/fixtures/auth-session.html')
}

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
