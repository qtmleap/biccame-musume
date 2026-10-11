import { describe, expect, test } from 'bun:test'
import { fromArchiveRecord } from '../../scripts/lib/event-detect/raw'

// list-timeline アーカイブの 1 行。raw は X GraphQL の Tweet の形を、判定に要るところだけ再現する。

const user = (screenName: string) => ({ user_results: { result: { core: { screen_name: screenName } } } })

const tweet = (
  id: string,
  screenName: string,
  legacy: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: user(screenName),
  legacy: { id_str: id, full_text: `本文 ${id}`, ...legacy },
  ...extra
})

const record = (raw: unknown, overrides: Record<string, unknown> = {}) => ({
  id: '100',
  createdAt: '2026-06-01T01:00:00.000Z',
  text: '一覧用の短縮本文…',
  author: { id: '1', name: '店舗', screenName: 'bic_example' },
  hashtags: [],
  url: 'https://x.com/bic_example/status/100',
  raw,
  ...overrides
})

const convert = (value: unknown) => {
  const result = fromArchiveRecord(value)
  if ('skipped' in result) throw new Error(`skipped: ${result.skipped}`)
  return result.post
}

describe('fromArchiveRecord', () => {
  test('通常の投稿は full_text を本文にし、画像 URL を残す', () => {
    const post = convert(
      record(
        tweet('100', 'bic_example', {
          full_text: '名刺を配布 &amp; アクキー &lt;限定&gt; https://t.co/x',
          extended_entities: { media: [{ media_url_https: 'https://pbs.twimg.com/media/a.jpg', type: 'photo' }] }
        })
      )
    )
    expect(post).toMatchObject({
      kind: 'original',
      screenName: 'bic_example',
      text: '名刺を配布 & アクキー <限定> https://t.co/x',
      media: ['https://pbs.twimg.com/media/a.jpg']
    })
  })

  test('長文投稿は note_tweet の全文を使う', () => {
    const post = convert(
      record(
        tweet(
          '100',
          'bic_example',
          { full_text: '途中で切れた本文…' },
          { note_tweet: { note_tweet_results: { result: { text: '長文の全文。配布は無くなり次第終了です。' } } } }
        )
      )
    )
    expect(post.text).toBe('長文の全文。配布は無くなり次第終了です。')
  })

  test('リツイートは元投稿の本文と投稿者を retweeted に持つ', () => {
    const original = tweet(
      '50',
      'other_store',
      {},
      { note_tweet: { note_tweet_results: { result: { text: '元投稿の全文' } } } }
    )
    const post = convert(
      record(
        tweet('100', 'bic_example', {
          full_text: 'RT @other_store: 元投稿…',
          retweeted_status_result: { result: original }
        })
      )
    )
    expect(post.kind).toBe('retweet')
    expect(post.retweeted).toEqual({ id: '50', screenName: 'other_store', text: '元投稿の全文' })
  })

  test('可視性ラッパーは本体・引用元のどちらでも外す', () => {
    const quoted = {
      __typename: 'TweetWithVisibilityResults',
      tweet: tweet('60', 'bic_other', { full_text: '引用元の告知' })
    }
    const raw = {
      __typename: 'TweetWithVisibilityResults',
      limitedActionResults: {},
      tweet: tweet('100', 'bic_example', { quoted_status_id_str: '60' }, { quoted_status_result: { result: quoted } })
    }
    const post = convert(record(raw))
    expect(post.kind).toBe('quote')
    expect(post.quoted).toEqual({ id: '60', screenName: 'bic_other', text: '引用元の告知' })
  })

  test('引用元が削除されていても ID だけで引用として扱う', () => {
    const post = convert(
      record(tweet('100', 'bic_example', { quoted_status_id_str: '70' }, { quoted_status_result: {} }))
    )
    expect(post.kind).toBe('quote')
    expect(post.quoted).toEqual({ id: '70' })
  })

  test('リツイート元が削除されていてもリツイートとして扱う', () => {
    const post = convert(record(tweet('100', 'bic_example', { retweeted_status_result: {} })))
    expect(post.kind).toBe('retweet')
    expect(post.retweeted).toBeUndefined()
  })

  test('リプライは返信先を持ち、引用より優先する', () => {
    const post = convert(
      record(
        tweet('100', 'bic_example', {
          in_reply_to_status_id_str: '90',
          in_reply_to_screen_name: 'bic_example',
          quoted_status_id_str: '80'
        })
      )
    )
    expect(post.kind).toBe('reply')
    expect(post.replyTo).toEqual({ id: '90', screenName: 'bic_example' })
  })

  test('壊れたレコードは例外にせず理由を返す', () => {
    expect(fromArchiveRecord(undefined)).toEqual({ skipped: 'invalid_record' })
    expect(fromArchiveRecord(record({ __typename: 'TweetTombstone' }))).toEqual({ skipped: 'invalid_tweet' })
    expect(fromArchiveRecord(record(tweet('100', 'bic_example', { full_text: '' })))).toEqual({ skipped: 'empty_text' })
  })
})
