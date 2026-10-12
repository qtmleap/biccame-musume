import { expect, spyOn, test } from 'bun:test'
import routes from '@api/routes/admin-twitter'
import * as accountService from '@api/services/bot-account'

test('failed direct account lookup cannot be cached', async () => {
  const lookup = spyOn(accountService, 'readPostingAccount').mockImplementation(async () => {
    throw new Error('X account status unavailable: disabled')
  })
  try {
    const response = await routes.request('/admin/twitter/status', undefined, {})
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: false, error: 'X account status unavailable: disabled' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  } finally {
    lookup.mockRestore()
  }
})
test('successful direct account lookup cannot be cached', async () => {
  const lookup = spyOn(accountService, 'readPostingAccount').mockResolvedValue({
    restId: '123',
    screenName: 'status_test',
    name: 'Status test',
    followersCount: 0,
    friendsCount: 0,
    statusesCount: 0,
    favouritesCount: 0,
    listedCount: 0,
    mediaCount: 0,
    createdAt: 'Thu Oct 01 00:00:00 +0000 2026',
    profileImageUrl: 'https://example.com/avatar.png',
    profileBannerUrl: null,
    description: ''
  })
  try {
    const response = await routes.request('/admin/twitter/status', undefined, {})
    expect(await response.json()).toMatchObject({ ok: true, account: { screenName: 'status_test' } })
    expect(response.headers.get('cache-control')).toBe('no-store')
  } finally {
    lookup.mockRestore()
  }
})
