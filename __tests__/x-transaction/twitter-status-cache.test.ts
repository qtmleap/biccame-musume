import { expect, test } from 'bun:test'
import type { AccountResult, BotRpc } from '@biccame/shared/bot'
import routes from '../../workers/app/src/api/admin-twitter'
import type { Bindings } from '../../workers/app/src/types/bindings'

const environment = (result: AccountResult) => {
  const bot: BotRpc = {
    ping: async (input) => ({
      requestId: input.requestId,
      service: 'bot',
      phase: 'posting',
      notificationsEnabled: false
    }),
    announce: async () => ({ status: 'disabled' }),
    postingSessionStatus: async () => ({ ok: false, kind: 'disabled' }),
    accountStatus: async () => result
  }
  return { BOT: bot } as Bindings
}

test('does not allow failed account RPC status to be cached', async () => {
  const response = await routes.request(
    '/admin/twitter/status',
    undefined,
    environment({ ok: false, kind: 'authentication' })
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: false, error: 'X account status unavailable: authentication' })
  expect(response.headers.get('cache-control')).toBe('no-store')
})

test('does not allow successful account RPC status to be cached', async () => {
  const response = await routes.request(
    '/admin/twitter/status',
    undefined,
    environment({
      ok: true,
      account: {
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
      }
    })
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: true, account: { screenName: 'status_test' } })
  expect(response.headers.get('cache-control')).toBe('no-store')
})
