import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadAvatars } from '@api/lib/og-avatars'
import { createTextMetrics, MEASURE_TOLERANCE, textMetricsFor } from '@api/lib/og-text-metrics'
import {
  clusterSlots,
  dateColumnWidth,
  eventAvatarSlots,
  eventStoreCount,
  eventTitleLayout,
  planSummaryRow,
  socialImageCharacters,
  socialImageHeight,
  storeChunks,
  summaryTitleLayout
} from '@api/lib/social-post-image'
import { buildSummarySnapshot, socialEventView } from '@biccame/shared/domain/social-post'
import { type Event, EventSchema } from '@biccame/shared/schemas/event.dto'
import {
  type SocialEmptyImage,
  type SocialRow,
  type SocialSnapshot,
  SocialSnapshotSchema
} from '@biccame/shared/social'

const FONT_DIR = resolve(import.meta.dir, '../workers/web/public/fonts')
const toArrayBuffer = (buffer: Buffer): ArrayBuffer => new Uint8Array(buffer).buffer
// 本番の描画（renderOgPng）と同じフォントのバッファ。
const fonts = ([500, 700] as const).map((weight) => ({
  data: toArrayBuffer(readFileSync(resolve(FONT_DIR, `zen-maru-gothic-${weight}.woff`))),
  weight
}))
const metrics = createTextMetrics(fonts)

const uuid = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`
const fixtureEvent = (n: number, input: Record<string, unknown> = {}): Event => {
  const parsed = EventSchema.safeParse({
    uuid: uuid(n),
    title: `イベント${n}`,
    category: 'limited_card',
    stores: ['akiba'],
    characterIds: ['akiba'],
    startDate: '2026-10-12T10:00:00+09:00',
    endDate: '2026-10-18T23:59:59+09:00',
    isVerified: true,
    isPreliminary: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    conditions: [],
    status: 'ongoing',
    daysUntil: 0,
    interestedCount: 0,
    completedCount: 0,
    ...input
  })
  if (!parsed.success) throw new Error('Invalid fixture')
  return parsed.data
}

const snapshotOf = (input: unknown): SocialSnapshot => {
  const parsed = SocialSnapshotSchema.safeParse(input)
  if (!parsed.success) throw new Error(`Invalid snapshot fixture: ${parsed.error.message}`)
  return parsed.data
}
const createdSnapshot = (event: Event): SocialSnapshot =>
  snapshotOf({
    kind: 'created',
    key: `created:${event.uuid}:initial`,
    scheduledAt: '2026-10-12T00:00:00.000Z',
    text: event.title,
    images: [{ type: 'event', event: socialEventView(event) }]
  })
/** 開始1件・終了1件の毎朝（画像は開始・終了の2枚）。 */
const dailySnapshot = (starting: Event, ending: Event): SocialSnapshot => {
  const snapshot = buildSummarySnapshot({
    kind: 'daily',
    scheduledAt: '2026-10-12T00:00:00.000Z',
    starting: [starting],
    ending: [ending]
  })
  if (snapshot === null) throw new Error('Invalid daily fixture')
  return snapshot
}

const row = (input: Partial<SocialRow> = {}): SocialRow => ({
  eventIds: [uuid(1)],
  title: '題名',
  stores: ['新宿店'],
  avatars: ['akiba'],
  target: null,
  period: null,
  date: null,
  ...input
})
const names = (count: number) => Array.from({ length: count }, (_, index) => `${'あ'.repeat(5)}${index}店`)
/** 全角n文字。ZenMaruGothic は全角の送り幅が 1em なので、幅は n × 文字サイズになる。 */
const wide = (count: number) => 'あ'.repeat(count)

describe('text metrics', () => {
  test('measures fullwidth glyphs as 1em and latin glyphs by their advance width', () => {
    expect(metrics.width(wide(10), 40)).toBeCloseTo(400, 5)
    expect(metrics.width('0', 100)).toBeCloseTo(50.2, 5)
    // フォントが持たない字は .notdef の送り幅（satori が描くときと同じ）で測る。
    expect(metrics.width('😀', 100)).toBeCloseTo(85.1, 5)
  })

  test('parses each weight lazily and reuses the metrics for the same font buffers', () => {
    expect(textMetricsFor(fonts)).toBe(textMetricsFor(fonts))
    expect(() => createTextMetrics([fonts[0]]).width('あ', 40, 700)).toThrow('Text metrics font is missing: 700')
    expect(createTextMetrics([fonts[0]]).width('あ', 40, 500)).toBeCloseTo(40, 5)
  })
})

describe('event image layout', () => {
  // 右の文字領域は 708px。題名は 56→52→48px で1行に収まる最大、収まらなければ 42px で最大3行。
  const width = 708
  test('chooses the largest title size that fits on one line, then falls back to 42px and three lines', () => {
    expect(eventTitleLayout(wide(12), width, metrics)).toEqual({ size: 56, lines: 1 })
    expect(eventTitleLayout(wide(13), width, metrics)).toEqual({ size: 52, lines: 1 })
    expect(eventTitleLayout(wide(14), width, metrics)).toEqual({ size: 48, lines: 1 })
    expect(eventTitleLayout(wide(15), width, metrics)).toEqual({ size: 42, lines: 3 })
  })

  test('lists up to three stores and collapses the rest after two', () => {
    expect([1, 2, 3, 4, 7].map((count) => eventStoreCount(names(count)))).toEqual([1, 2, 3, 2, 2])
    expect(storeChunks(['A店', 'B店', 'C店'], 3, '#115e59').map((chunk) => chunk.text)).toEqual([
      'A店・',
      'B店・',
      'C店'
    ])
    expect(storeChunks(names(4), 2, '#115e59').map((chunk) => chunk.text)).toEqual([
      'あああああ0店・',
      'あああああ1店',
      'ほか2店舗'
    ])
  })

  test('places one avatar centered in the side band and stacks up to three inside it', () => {
    expect(eventAvatarSlots(1)).toEqual([{ left: 40, top: 165, d: 300 }])
    for (const count of [2, 3]) {
      const slots = eventAvatarSlots(count)
      expect(slots).toHaveLength(count)
      // 先頭の娘（手前）が最も大きく、全員が縦帯（幅380・高さ630）に収まる。
      expect(slots[0].d).toBe(250)
      for (const slot of slots) {
        expect(slot.left).toBeGreaterThanOrEqual(0)
        expect(slot.left + slot.d).toBeLessThanOrEqual(380)
        expect(slot.top).toBeGreaterThanOrEqual(0)
        expect(slot.top + slot.d).toBeLessThanOrEqual(630)
      }
    }
    expect(clusterSlots(3, { x0: 0, w: 380, h: 630, frontD: 250, backD: 215, m: 16, mv: 20 })).toEqual(
      eventAvatarSlots(3)
    )
  })
})

describe('summary image layout', () => {
  // 毎朝の行の文字領域は 1200 - 28×2 - 104 - 16 = 1024px。
  const width = 1024
  test('keeps the title on one line: 42px, then 38px, then an ellipsis', () => {
    expect(summaryTitleLayout(wide(24), width, metrics)).toEqual({ size: 42, ellipsis: false })
    expect(summaryTitleLayout(wide(25), width, metrics)).toEqual({ size: 38, ellipsis: false })
    expect(summaryTitleLayout(wide(28), width, metrics)).toEqual({ size: 38, ellipsis: true })
  })

  test('shows every store when they fit and reduces stores from the end when they do not', () => {
    const plenty = planSummaryRow(row({ stores: names(2), period: '10/18(日)まで' }), 'starting', width, metrics)
    expect(plenty.storeCount).toBe(2)
    expect(plenty.chunks.map((chunk) => chunk.text)).toEqual(['あああああ0店・', 'あああああ1店', '10/18(日)まで'])
    // 7店舗は先頭5店舗に絞ってから、幅に収まるまで減らす（残りは「ほかN店舗」）。
    const many = planSummaryRow(row({ stores: names(7) }), 'ending', width, metrics)
    expect(many.storeCount).toBe(3)
    expect(many.chunks.at(-1)?.text).toBe('ほか4店舗')
    expect(
      many.chunks.reduce((sum, chunk) => sum + metrics.width(chunk.text, 34) + chunk.after, 0)
    ).toBeLessThanOrEqual(width - MEASURE_TOLERANCE)
  })

  test('drops the target label only when even a single store does not leave room for it', () => {
    const target = '対象の娘'
    const fits = planSummaryRow(row({ stores: ['新宿店'], target }), 'starting', width, metrics)
    expect(fits.showTarget).toBe(true)
    expect(fits.chunks.map((chunk) => chunk.text)).toEqual(['新宿店', `対象: ${target}`])
    const tooLong = planSummaryRow(row({ stores: [wide(28)], target }), 'starting', width, metrics)
    expect(tooLong.showTarget).toBe(false)
    expect(tooLong.chunks.map((chunk) => chunk.text)).toEqual([wide(28)])
  })

  test('sizes the weekly date column from the widest date text', () => {
    const date = dateColumnWidth(metrics)
    expect(date).toBeGreaterThanOrEqual(Math.ceil(metrics.width('12/28(水)', 40)) + 12)
    expect(date).toBeLessThan(240)
  })
})

describe('image properties', () => {
  const event = fixtureEvent(1, { stores: ['akiba', 'chofu'], characterIds: ['akiba', 'chofu'] })
  const eventImage = createdSnapshot(event).images[0]
  const [starting, ending] = dailySnapshot(
    fixtureEvent(2),
    fixtureEvent(3, { endDate: '2026-10-12T20:00:00+09:00' })
  ).images
  const empty: SocialEmptyImage = { type: 'empty', side: 'ending', headline: '2026年10月12日(月)' }

  test('uses 1200x630 for created / updated images and 1200x675 for daily / weekly images', () => {
    expect(socialImageHeight(eventImage)).toBe(630)
    expect(socialImageHeight(starting)).toBe(675)
    expect(socialImageHeight(ending)).toBe(675)
    expect(socialImageHeight(empty)).toBe(675)
  })

  test('lists the characters to draw, without loading anything for empty images', () => {
    expect(socialImageCharacters(eventImage)).toEqual(['akiba', 'chofu'])
    expect(socialImageCharacters(starting)).toEqual(['akiba'])
    expect(socialImageCharacters(empty)).toEqual([])
  })
})

describe('avatar loading', () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const png = (size: number) =>
    Uint8Array.from({ length: size }, (_, index) => (index < PNG.length ? PNG[index] : index % 251))
  /** ASSETS の代わり。存在しないパスは本番（SPA のフォールバック）と同じく 200 の HTML を返す。 */
  const assets = (files: Record<string, () => Response | Promise<Response>>) => {
    const requested: string[] = []
    const env = {
      ASSETS: {
        fetch: async (input: RequestInfo | URL) => {
          const path = new URL(input instanceof Request ? input.url : input).pathname
          requested.push(path)
          const file = files[path]
          return file === undefined
            ? new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } })
            : file()
        }
      }
    }
    return { env, requested }
  }
  const pngResponse = (bytes: Uint8Array<ArrayBuffer>) => () =>
    new Response(bytes, { headers: { 'content-type': 'image/png' } })

  test('reads store avatars as data URLs, skips special values, and caches only successes', async () => {
    // 64KB を超える PNG でも data URL に変換できる（引数の上限を超えない）。
    const big = png(100_000)
    const { env, requested } = assets({ '/og/avatars/shinjyuku.png': pngResponse(big) })
    const first = await loadAvatars(env, 'https://example.test', ['shinjyuku', 'secret', 'other', 'shinjyuku', 'akiba'])
    expect([...first.keys()]).toEqual(['shinjyuku'])
    const url = first.get('shinjyuku')
    if (url === undefined) throw new Error('Expected the shinjyuku avatar to be loaded')
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(Uint8Array.from(atob(url.replace('data:image/png;base64,', '')), (c) => c.charCodeAt(0))).toEqual(big)
    // 特殊値は読まない。素材が無い娘（akiba）は結果に含まれず、キャッシュもされないので次の描画でもう一度読む。
    expect(requested.toSorted()).toEqual(['/og/avatars/akiba.png', '/og/avatars/shinjyuku.png'])
    await loadAvatars(env, 'https://example.test', ['shinjyuku', 'akiba'])
    expect(requested.toSorted()).toEqual([
      '/og/avatars/akiba.png',
      '/og/avatars/akiba.png',
      '/og/avatars/shinjyuku.png'
    ])
  })

  test('returns nothing for broken assets instead of throwing', async () => {
    const { env } = assets({
      '/og/avatars/nagoya.png': () => new Response('<html></html>', { headers: { 'content-type': 'image/png' } }),
      '/og/avatars/chiba.png': () => new Response(png(64), { status: 404, headers: { 'content-type': 'image/png' } }),
      '/og/avatars/sapporo.png': () => {
        throw new Error('assets unavailable')
      }
    })
    expect((await loadAvatars(env, 'https://example.test', ['nagoya', 'chiba', 'sapporo'])).size).toBe(0)
  })
})
