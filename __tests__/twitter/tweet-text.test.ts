import { describe, expect, test } from 'bun:test'
import type { EventDetail } from '../../src/schemas/event.dto'
import {
  buildDailySummaryText,
  buildEventCreatedText,
  buildEventUpdatedText,
  getQuoteTweetId,
  weightedLength
} from '../../src/utils/tweet-text'

const TWEET_LIMIT = 280

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
    expect(() => buildDailySummaryText([])).toThrow()
  })

  test('1 event: contains header + line + URL + hashtags', () => {
    const out = buildDailySummaryText([e(1)])
    expect(out).toContain('本日開始のイベント (1件)')
    expect(out).toContain('テストイベント1')
    expect(out).toContain('biccame-musume.com/events/00000001')
    expect(out).toContain('#ビッカメ娘')
  })

  test('3 events: lists all 3', () => {
    const out = buildDailySummaryText([e(1), e(2), e(3)])
    expect(out).toContain('テストイベント1')
    expect(out).toContain('テストイベント2')
    expect(out).toContain('テストイベント3')
    expect(weightedLength(out)).toBeLessThanOrEqual(TWEET_LIMIT)
  })

  test('many events: truncates to "他 N 件" + site URL while keeping first M', () => {
    const events = Array.from({ length: 30 }, (_, i) => e(i + 1))
    const out = buildDailySummaryText(events)
    expect(out).toContain('本日開始のイベント (30件)')
    expect(out).toMatch(/他 \d+ 件/)
    expect(out).toContain('https://biccame-musume.com/events')
    expect(weightedLength(out)).toBeLessThanOrEqual(TWEET_LIMIT)
  })

  test('fallback when nothing fits: header + site URL + hashtags only', () => {
    // synthesise an event whose single line already overflows
    const giantTitle = 'あ'.repeat(1000)
    const out = buildDailySummaryText([{ ...e(1), title: giantTitle }])
    expect(out).toContain('本日開始のイベント (1件)')
    expect(out).toContain('https://biccame-musume.com/events')
    expect(weightedLength(out)).toBeLessThanOrEqual(TWEET_LIMIT)
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
