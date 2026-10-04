import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import routes from '../../workers/app/src/api/admin-twitter'
import { Twitter } from '../../workers/app/src/utils/twitter'

afterEach(() => mock.restore())

test('does not allow a failed authentication status to be cached', async () => {
  spyOn(Twitter.prototype, 'getOwnAccount').mockRejectedValue(new Error('Authentication expired'))
  const response = await routes.request('/admin/twitter/status')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: false, error: 'Authentication expired' })
  expect(response.headers.get('cache-control')).toBe('no-store')
})

test('does not allow a successful authentication status to be cached', async () => {
  spyOn(Twitter.prototype, 'getOwnAccount').mockResolvedValue({
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
  const response = await routes.request('/admin/twitter/status')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, account: { screenName: 'status_test' } })
  expect(response.headers.get('cache-control')).toBe('no-store')
})
