import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'block' })
test.setTimeout(60_000)

const managers = [
  {
    path: 'comments',
    payload: (label: string) => ({
      comments: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          eventId: '22222222-2222-4222-8222-222222222222',
          eventTitle: 'Cache regression event',
          characterId: 'akiba',
          body: label,
          ipAddress: '127.0.0.1',
          userId: null,
          deletedAt: null,
          createdAt: '2026-10-02T00:00:00.000Z'
        }
      ]
    })
  },
  {
    path: 'users',
    payload: (label: string) => ({
      users: [
        {
          id: 'cache-regression-user',
          displayName: label,
          email: 'test@example.com',
          thumbnailURL: null,
          createdAt: '2026-10-02T00:00:00.000Z'
        }
      ]
    })
  }
]

for (const manager of managers) {
  test(`reopening admin ${manager.path} fetches fresh data and hides old data while loading`, async ({ page }) => {
    let requests = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`**/api/admin/${manager.path}*`, async (route) => {
      requests += 1
      if (requests > 1) await gate
      await route.fulfill({
        json: manager.payload(requests === 1 ? 'Previously cached record' : 'Fresh management record')
      })
    })
    await page.goto(`/admin/${manager.path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Previously cached record', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('link', { name: '管理画面に戻る' }).click()
    await expect(page.getByRole('heading', { name: '管理画面', exact: true })).toBeVisible({ timeout: 30_000 })
    try {
      await page.locator(`a[href="/admin/${manager.path}"], a[href="/admin/${manager.path}/"]`).click()
      await expect.poll(() => requests).toBe(2)
      await expect(page.getByText('Previously cached record', { exact: true })).toHaveCount(0)
    } finally {
      release()
    }
    await expect(page.getByText('Fresh management record', { exact: true })).toBeVisible()
    expect(requests).toBe(2)
  })
}
