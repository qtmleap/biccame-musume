import { expect, spyOn, test } from 'bun:test'
import { postDiscordImages } from '@api/services/discord'
import { sendSocialPost } from '@api/services/social-posting'
import type { SocialSnapshot } from '@biccame/shared/social'
import { TwitterTransport } from '@biccame/shared/x/transport'
import { snapshot } from './fixtures/social-posting'
import { dailySnapshot } from './fixtures/social-snapshots'

const discordEnv = { DISCORD_TOKEN: 'synthetic', DISCORD_CHANNEL_ID: '12345' }

test('Discord multipart attaches every PNG to one message with matching attachments; never falls back to text', async () => {
  const calls: RequestInit[] = []
  const response = await postDiscordImages(
    discordEnv,
    '@everyone event',
    [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6]), new Uint8Array([7])],
    'test-nonce',
    async (_url, init) => {
      calls.push(init)
      return new Response(JSON.stringify({ id: '123' }))
    }
  )
  expect(response).toEqual({ status: 'sent', messageId: '123' })
  expect(calls).toHaveLength(1)
  const form = calls[0].body
  if (!(form instanceof FormData)) throw new Error('Expected multipart')
  const payload = JSON.parse(String(form.get('payload_json')))
  expect(payload).toMatchObject({ allowed_mentions: { parse: [] }, enforce_nonce: true, nonce: 'test-nonce' })
  const filenames = [0, 1, 2, 3].map((index) => `event-${index + 1}.png`)
  expect(payload.attachments).toEqual(filenames.map((filename, id) => ({ id, filename })))
  for (const [index, filename] of filenames.entries()) {
    const file = form.get(`files[${index}]`)
    expect(file instanceof File && [file.type, file.name]).toEqual(['image/png', filename])
  }
  expect(form.get('files[4]')).toBeNull()
  const sizes = await Promise.all(
    [0, 1, 2, 3].map(async (index) => {
      const file = form.get(`files[${index}]`)
      return file instanceof Blob ? (await file.arrayBuffer()).byteLength : -1
    })
  )
  expect(sizes).toEqual([2, 1, 3, 1])
  // 画像なしの送信、5xx（受理済みかもしれない）は再送しない。
  const never = async () => {
    throw new Error('transport must not be called')
  }
  expect(await postDiscordImages(discordEnv, 'event', [], 'nonce', never)).toEqual({
    status: 'failed',
    kind: 'invalid_input'
  })
  expect(
    await postDiscordImages(
      discordEnv,
      'event',
      [new Uint8Array([1])],
      'nonce',
      async () => new Response('{}', { status: 500 })
    )
  ).toEqual({ status: 'unknown', kind: 'delivery_unknown' })
  expect(await postDiscordImages({}, 'event', [new Uint8Array([1])], 'nonce', never)).toEqual({
    status: 'failed',
    kind: 'configuration'
  })
})

test('X authentication/upload precede one tweet carrying every media id; known pre-send errors retry, unknown tweets stop', async () => {
  const auth = spyOn(TwitterTransport.prototype, 'checkAuthenticatedSession').mockResolvedValue()
  const active = { current: 0, max: 0 }
  const order: string[] = []
  const upload = spyOn(TwitterTransport.prototype, 'uploadImage').mockImplementation(async (png) => {
    active.current += 1
    active.max = Math.max(active.max, active.current)
    // 並列に呼ばれた場合に重なりが観測できるよう、1回待つ。
    await Promise.resolve()
    await Promise.resolve()
    active.current -= 1
    order.push(`upload:${png[0]}`)
    return `media-${png[0]}`
  })
  const tweet = spyOn(TwitterTransport.prototype, 'tweet').mockImplementation(async () => {
    order.push('tweet')
    return '67890'
  })
  const env = { TWITTER_AUTH_TOKEN: 'synthetic', TWITTER_CSRF_TOKEN: 'synthetic' }
  const four = dailySnapshot(8, 8)
  expect(four.images).toHaveLength(4)
  const pngs = four.images.map((_, index) => new Uint8Array([index + 1]))
  try {
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({ status: 'sent', id: '67890' })
    expect(auth).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(4)
    expect(tweet).toHaveBeenCalledTimes(1)
    // upload は画像の順に直列で、全部終わってから tweet を1回だけ送る。
    expect(active.max).toBe(1)
    expect(order).toEqual(['upload:1', 'upload:2', 'upload:3', 'upload:4', 'tweet'])
    expect(tweet.mock.calls[0]?.[0]).toBe(four.text)
    expect(tweet.mock.calls[0]?.[1]?.mediaIds).toEqual(['media-1', 'media-2', 'media-3', 'media-4'])
    // 1枚の投稿は media 1つ。引用元はそのまま渡る。
    const single: SocialSnapshot = { ...snapshot('single'), quoteTweetId: '123' }
    tweet.mockClear()
    expect(await sendSocialPost(env, 'x', single, [new Uint8Array([9])], 'nonce')).toEqual({
      status: 'sent',
      id: '67890'
    })
    expect(tweet.mock.calls[0]?.[1]).toEqual({ mediaIds: ['media-9'], quoteTweetId: '123' })
    // 3枚目の upload が失敗したら tweet は送らず、再試行できる失敗にする。
    tweet.mockClear()
    upload.mockClear()
    upload.mockResolvedValueOnce('media-1').mockResolvedValueOnce('media-2').mockRejectedValueOnce(new Error('upload'))
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'failed',
      kind: 'media_preparation_failed',
      retry: 60
    })
    expect(upload).toHaveBeenCalledTimes(3)
    expect(tweet).not.toHaveBeenCalled()
    // 認証失敗は upload もしない。
    upload.mockClear()
    auth.mockRejectedValueOnce(new Error('identity mismatch'))
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toMatchObject({ status: 'failed', retry: 60 })
    expect(upload).not.toHaveBeenCalled()
    expect(tweet).not.toHaveBeenCalled()
    // 画像の枚数が合わない、または空なら、画像なしで公開せず再試行もしない。
    for (const wrong of [[], pngs.slice(0, 3), [...pngs, new Uint8Array([5])]]) {
      expect(await sendSocialPost(env, 'x', four, wrong, 'nonce')).toEqual({ status: 'failed', kind: 'invalid_images' })
      expect(await sendSocialPost(env, 'discord', four, wrong, 'nonce')).toEqual({
        status: 'failed',
        kind: 'invalid_images'
      })
    }
    expect(upload).not.toHaveBeenCalled()
    expect(tweet).not.toHaveBeenCalled()
    // tweet 送信後の失敗: rate_limit は再試行、rejected は失敗、それ以外は unknown。
    tweet.mockRejectedValueOnce({ kind: 'rate_limit' })
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'failed',
      kind: 'rate_limit',
      retry: 60
    })
    tweet.mockRejectedValueOnce({ kind: 'rejected' })
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({ status: 'failed', kind: 'rejected' })
    tweet.mockRejectedValueOnce({ kind: 'delivery_unknown' })
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'unknown',
      kind: 'delivery_unknown'
    })
    tweet.mockRejectedValueOnce(new Error('network'))
    expect(await sendSocialPost(env, 'x', four, pngs, 'nonce')).toEqual({
      status: 'unknown',
      kind: 'delivery_unknown'
    })
  } finally {
    auth.mockRestore()
    upload.mockRestore()
    tweet.mockRestore()
  }
})
