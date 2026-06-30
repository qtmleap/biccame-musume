import { describe, expect, test } from 'bun:test'
import type { EventDetail } from '../../src/schemas/event.dto'
import {
  buildDailySummaryTweets,
  buildEndingTodaySummaryTweets,
  buildEventCreatedText,
  buildEventUpdatedText,
  getQuoteTweetId,
  TWEET_WEIGHT_LIMIT,
  weightedLength
} from '../../src/utils/tweet-text'

const TWEET_LIMIT = TWEET_WEIGHT_LIMIT

const baseEvent = (overrides: Partial<EventDetail> = {}): EventDetail =>
  ({
    uuid: '11111111-1111-4111-8111-111111111111',
    category: 'limited_card',
    title: 'シール録',
    stores: ['sagami'],
    startDate: new Date('2026-05-08T00:00:00+09:00'),
    endDate: new Date('2026-05-15T00:00:00+09:00'),
    conditions: [],
    isVerified: true,
    isPreliminary: false,
    status: 'upcoming',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    referenceUrls: [],
    comments: [],
    ...overrides
  }) as EventDetail

describe('weightedLength', () => {
  test('latin chars count 1 each', () => {
    expect(weightedLength('Hello')).toBe(5)
  })

  test('Japanese chars count 2 each', () => {
    expect(weightedLength('あいうえお')).toBe(10)
  })

  test('URLs count as fixed 23 regardless of length', () => {
    expect(weightedLength('https://biccame-musume.com/events/abcd')).toBe(23)
    expect(weightedLength('https://x.com/y')).toBe(23)
  })

  test('mixed: ascii + japanese + url', () => {
    // "abc" (3) + "あ" (2) + URL (23) = 28
    expect(weightedLength('abcあhttps://x.com/foo')).toBe(28)
  })
})

describe('buildEventCreatedText', () => {
  const out = buildEventCreatedText(baseEvent())

  test('contains the event title', () => {
    expect(out).toContain('シール録')
  })

  test('contains the event detail URL', () => {
    expect(out).toContain('https://biccame-musume.com/events/11111111-1111-4111-8111-111111111111')
  })

  test('contains required hashtags', () => {
    expect(out).toContain('#ビッカメ娘')
    expect(out).toContain('#ビックカメラ')
  })

  test('says "追加しました"', () => {
    expect(out).toContain('追加しました')
  })

  test('fits within 280 weighted chars', () => {
    expect(weightedLength(out)).toBeLessThanOrEqual(TWEET_LIMIT)
  })
})

describe('buildEventUpdatedText', () => {
  const out = buildEventUpdatedText(baseEvent())

  test('says "更新しました"', () => {
    expect(out).toContain('更新しました')
  })

  test('fits within 280 weighted chars', () => {
    expect(weightedLength(out)).toBeLessThanOrEqual(TWEET_LIMIT)
  })
})

describe('buildDailySummaryText', () => {
  const e = (i: number) =>
    ({
      uuid: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      title: `テストイベント${i}`,
      stores: ['sagami']
    }) as Pick<EventDetail, 'uuid' | 'title' | 'stores'>

  test('throws when 0 events', () => {
    expect(() => buildDailySummaryTweets([])).toThrow()
  })

  test('1 event: 1 tweet, header + line + hashtags, no URL', () => {
    const tweets = buildDailySummaryTweets([e(1)])
    expect(tweets).toHaveLength(1)
    const t = tweets[0]
    expect(t).toContain('本日は1件のイベントが開催予定です！')
    expect(t).toContain('- さがみたんのテストイベント1')
    expect(t).not.toContain('biccame-musume.com/events/00000001')
    expect(t).toContain('#ビッカメ娘')
    expect(t).toContain('#ビックカメラ')
  })

  test('3 events fit in 1 tweet', () => {
    const tweets = buildDailySummaryTweets([e(1), e(2), e(3)])
    expect(tweets).toHaveLength(1)
    expect(tweets[0]).toContain('テストイベント1')
    expect(tweets[0]).toContain('テストイベント2')
    expect(tweets[0]).toContain('テストイベント3')
  })

  test('4 events split into 2 tweets (3 + 1)', () => {
    const tweets = buildDailySummaryTweets([e(1), e(2), e(3), e(4)])
    expect(tweets).toHaveLength(2)
    expect(tweets[0]).toContain('テストイベント1')
    expect(tweets[0]).toContain('テストイベント3')
    expect(tweets[1]).toContain('テストイベント4')
    expect(tweets[1]).not.toContain('本日は')
  })

  test('only the first tweet has the "本日は…件" header', () => {
    const tweets = buildDailySummaryTweets(Array.from({ length: 7 }, (_, i) => e(i + 1)))
    expect(tweets).toHaveLength(3)
    expect(tweets[0]).toContain('本日は7件のイベントが開催予定です！')
    expect(tweets[1]).not.toContain('本日は')
    expect(tweets[2]).not.toContain('本日は')
  })

  test('every tweet in the thread has both #ビッカメ娘 and #ビックカメラ', () => {
    const tweets = buildDailySummaryTweets(Array.from({ length: 10 }, (_, i) => e(i + 1)))
    for (const t of tweets) {
      expect(t).toContain('#ビッカメ娘')
      expect(t).toContain('#ビックカメラ')
    }
  })

  test('every tweet in the thread fits within 280 weighted chars (= 140 JP chars)', () => {
    const tweets = buildDailySummaryTweets(Array.from({ length: 30 }, (_, i) => e(i + 1)))
    for (const t of tweets) {
      expect(weightedLength(t)).toBeLessThanOrEqual(TWEET_LIMIT)
    }
  })

  test('throws when a single event line is so long it cannot fit', () => {
    const giantTitle = 'あ'.repeat(1000)
    expect(() => buildDailySummaryTweets([{ ...e(1), title: giantTitle }])).toThrow(/exceeds/)
  })
})

describe('buildEndingTodaySummaryTweets', () => {
  const e = (i: number) =>
    ({
      uuid: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      title: `終了イベント${i}`,
      stores: ['sagami']
    }) as Pick<EventDetail, 'uuid' | 'title' | 'stores'>

  test('throws when 0 events', () => {
    expect(() => buildEndingTodaySummaryTweets([])).toThrow()
  })

  test('1 event: 1 tweet with ending-today header', () => {
    const tweets = buildEndingTodaySummaryTweets([e(1)])
    expect(tweets).toHaveLength(1)
    const t = tweets[0]
    expect(t).toContain('本日最終日のイベントは1件！')
    expect(t).toContain('- さがみたんの終了イベント1')
    expect(t).toContain('#ビッカメ娘')
    expect(t).toContain('#ビックカメラ')
  })

  test('4 events split into 2 tweets, only the first has the header', () => {
    const tweets = buildEndingTodaySummaryTweets([e(1), e(2), e(3), e(4)])
    expect(tweets).toHaveLength(2)
    expect(tweets[0]).toContain('本日最終日のイベントは4件！')
    expect(tweets[0]).toContain('終了イベント3')
    expect(tweets[1]).toContain('終了イベント4')
    expect(tweets[1]).not.toContain('本日最終日')
  })

  test('every tweet in the thread fits within the tweet weight limit', () => {
    const tweets = buildEndingTodaySummaryTweets(Array.from({ length: 30 }, (_, i) => e(i + 1)))
    for (const t of tweets) {
      expect(weightedLength(t)).toBeLessThanOrEqual(TWEET_LIMIT)
    }
  })
})

describe('getQuoteTweetId', () => {
  const announceX = { type: 'announce' as const, url: 'https://x.com/foo/status/100' }
  const endX = { type: 'end' as const, url: 'https://x.com/foo/status/200' }
  const announceWeb = { type: 'announce' as const, url: 'https://example.com/article' }
  const startX = { type: 'start' as const, url: 'https://x.com/foo/status/300' }

  test('create + announce X URL → returns its id', () => {
    expect(getQuoteTweetId([announceX, endX], 'create')).toBe('100')
  })

  test('create + announce non-X URL → undefined (does not fall through)', () => {
    expect(getQuoteTweetId([announceWeb, endX], 'create')).toBeUndefined()
  })

  test('update + end X URL → returns end id', () => {
    expect(getQuoteTweetId([announceX, endX], 'update')).toBe('200')
  })

  test('update + no end URL → falls back to announce X', () => {
    expect(getQuoteTweetId([announceX, startX], 'update')).toBe('100')
  })

  test('update + no end + non-X announce → undefined', () => {
    expect(getQuoteTweetId([announceWeb], 'update')).toBeUndefined()
  })

  test('twitter.com URL is also recognized', () => {
    const t = { type: 'announce' as const, url: 'https://twitter.com/foo/status/999' }
    expect(getQuoteTweetId([t], 'create')).toBe('999')
  })

  test('empty refs → undefined', () => {
    expect(getQuoteTweetId([], 'create')).toBeUndefined()
    expect(getQuoteTweetId([], 'update')).toBeUndefined()
  })
})
