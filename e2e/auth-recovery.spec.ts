import { expect, test } from '@playwright/test'
import { prepare } from './fixtures/auth-session-support'

test('backend_auth_failure_shows_retry', async ({ page }) => {
  await prepare(page)
  await page.route('**/api/auth', (route) => route.fulfill({ status: 500, json: { success: false } }))
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await expect(page.getByRole('alert')).toContainText('認証に失敗しました')
  await expect(page.getByTestId('private-data')).toHaveCount(0)
  await page.route('**/api/auth', (route) => route.fulfill({ json: { success: true } }))
  await page.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-a')
})

test('stale_auth_response_is_ignored', async ({ page }) => {
  await prepare(page)
  const aStarted = Promise.withResolvers<void>()
  const releaseA = Promise.withResolvers<void>()
  const bStarted = Promise.withResolvers<void>()
  const releaseB = Promise.withResolvers<void>()
  await page.route('**/api/auth', async (route) => {
    const isA = route.request().headers().authorization === 'Bearer account-a'
    if (isA) {
      aStarted.resolve()
      await releaseA.promise
    } else {
      bStarted.resolve()
      await releaseB.promise
    }
    await route.fulfill({ json: { success: true } })
  })
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await aStarted.promise
  await page.getByRole('button', { name: 'Bでログイン' }).click()
  await expect(page.getByTestId('current-user')).toHaveText('account-b')
  releaseA.resolve()
  await bStarted.promise
  await expect(page.getByTestId('private-data')).toHaveCount(0)
  releaseB.resolve()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-b')
  await expect(page.getByTestId('private-data')).not.toContainText('account-a')
})

test('anonymous_me_redirects_without_pending_navigation', async ({ page }) => {
  await prepare(page)
  await page.route('**/api/**', (route) =>
    route.fulfill({ json: { events: [], characters: [], rankings: [], success: true } })
  )
  await page.goto('/me')
  await expect(page).toHaveURL('/')
})

test('stale_failure_from_previous_generation_does_not_replace_pending_retry', async ({ page }) => {
  await prepare(page)
  const started = Promise.withResolvers<void>()
  const releaseOld = Promise.withResolvers<void>()
  const nextStarted = Promise.withResolvers<void>()
  const releaseNext = Promise.withResolvers<void>()
  let requestCount = 0
  await page.route('**/api/auth', async (route) => {
    const first = ++requestCount === 1
    if (first) {
      started.resolve()
      await releaseOld.promise
    } else {
      nextStarted.resolve()
      await releaseNext.promise
    }
    await route.fulfill({ status: first ? 500 : 200, json: { success: !first } })
  })
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  await started.promise
  // Same UID, new auth notification: only a generation guard can distinguish these.
  await page.getByRole('button', { name: 'Aでログイン' }).click()
  releaseOld.resolve()
  await nextStarted.promise
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByTestId('private-data')).toHaveCount(0)
  releaseNext.resolve()
  await expect(page.getByTestId('private-data')).toContainText('推し: account-a')
})
