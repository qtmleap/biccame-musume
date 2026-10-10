import { describe, expect, test } from 'bun:test'
import { ChartsResponseSchema } from '@biccame/shared/event-detect/charts'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { analyze, type EmulatedEntry, type Judgements, postStats } from '../../scripts/lib/event-detect/analysis'
import { chartStats, PROBABILITY_BIN_COUNT } from '../../scripts/lib/event-detect/charts'
import type { GoldEvent } from '../../scripts/lib/event-detect/gold'

const ACCOUNT = 'bic_example'

/** 店舗アカウントの通常投稿。配布のキーワードを含むのでイベント候補になる */
const post = (id: string, createdAt: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
  id,
  createdAt,
  screenName: ACCOUNT,
  kind: 'original',
  text: '6/11から夏名刺を配布します',
  url: `https://x.com/${ACCOUNT}/status/${id}`,
  media: [],
  ...overrides
})

/** リツイートは候補にならない（reason が付く） */
const retweet = (id: string, createdAt: string): DetectPost => post(id, createdAt, { kind: 'retweet' })

const gold = (uuid: string, startDate: string, postId?: string): GoldEvent => ({
  uuid,
  title: '夏名刺',
  category: 'limited_card',
  stores: ['example'],
  startDate,
  conditions: [{ type: 'first_come', quantity: 100 }],
  isPreliminary: false,
  referenceUrls: postId === undefined ? [] : [{ type: 'announce', url: `https://x.com/${ACCOUNT}/status/${postId}` }]
})

const analysisOf = (posts: DetectPost[], events: GoldEvent[] = []) =>
  analyze({
    posts,
    events,
    accounts: [{ storeId: 'example', name: '例たん', screenName: ACCOUNT }],
    characterNames: ['例たん']
  })

const judgements = (llm: [string, number][] = [], clef: [string, number][] = []): Judgements => ({
  llm: new Map(llm),
  clef: new Map(clef)
})

const counts = (bins: { count: number }[]) => bins.map((bin) => bin.count)

const emulatedEntry = (overrides: Partial<EmulatedEntry> = {}): EmulatedEntry => ({
  store: 'example',
  firstSeen: Date.parse('2026-06-15T03:00:00.000Z'),
  ...overrides
})

const EVENT_ID_A = '00000000-0000-4000-8000-00000000000a'
const EVENT_ID_B = '00000000-0000-4000-8000-00000000000b'

describe('chartStats の確率のヒストグラム', () => {
  test('区間は 0.1 刻みの 10 個で、スキーマの区間数と同じ', () => {
    const result = chartStats(analysisOf([post('1', '2026-06-01T01:00:00.000Z')]))
    const { llmProbability, clefProbability } = result
    // スキーマの区間数（PROBABILITY_BIN_COUNT）と食い違えば、応答がスキーマを満たさない
    expect(ChartsResponseSchema.safeParse(result).success).toBe(true)
    expect(PROBABILITY_BIN_COUNT).toBe(10)
    expect(llmProbability.all.map((bin) => bin.label)).toEqual([
      '0.0–0.1',
      '0.1–0.2',
      '0.2–0.3',
      '0.3–0.4',
      '0.4–0.5',
      '0.5–0.6',
      '0.6–0.7',
      '0.7–0.8',
      '0.8–0.9',
      '0.9–1.0'
    ])
    expect(llmProbability.gold).toHaveLength(10)
    expect(clefProbability).toHaveLength(10)
  })

  test('0.1 ちょうどは次の区間に入り、0 は最初、1.0 は最後の区間に入る', () => {
    const ids = ['1', '2', '3', '4', '5', '6']
    const analysis = analysisOf(ids.map((id) => post(id, '2026-06-01T01:00:00.000Z')))
    const { llmProbability } = chartStats(
      analysis,
      judgements([
        ['1', 0],
        ['2', 0.09],
        ['3', 0.1],
        ['4', 0.7],
        ['5', 0.99],
        ['6', 1]
      ])
    )
    expect(counts(llmProbability.all)).toEqual([2, 1, 0, 0, 0, 0, 0, 1, 0, 2])
  })

  test('候補でない投稿は、判定があっても数えない。判定が無い候補も数えない', () => {
    const analysis = analysisOf([
      post('1', '2026-06-01T01:00:00.000Z'),
      retweet('2', '2026-06-01T02:00:00.000Z'),
      post('3', '2026-06-01T03:00:00.000Z')
    ])
    const { llmProbability, clefProbability } = chartStats(
      analysis,
      judgements(
        [
          ['1', 0.95],
          ['2', 0.95]
        ],
        [
          ['2', 0.95],
          ['3', 0.05]
        ]
      )
    )
    expect(counts(llmProbability.all)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(counts(clefProbability)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  test('D1 参考投稿の系列は、候補全体のうち参考 URL が指す投稿だけを数える', () => {
    const analysis = analysisOf(
      [post('1', '2026-06-01T01:00:00.000Z'), post('2', '2026-06-01T02:00:00.000Z')],
      [gold(EVENT_ID_A, '2026-06-10T15:00:00.000Z', '1')]
    )
    const { llmProbability, clefProbability } = chartStats(
      analysis,
      judgements(
        [
          ['1', 0.85],
          ['2', 0.85]
        ],
        [['1', 0.55]]
      )
    )
    expect(counts(llmProbability.all)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 2, 0])
    expect(counts(llmProbability.gold)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0])
    // Clef は候補全体の 1 系列だけ
    expect(counts(clefProbability)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0])
  })

  test('判定が無ければ、どの区間も 0', () => {
    const { llmProbability, clefProbability } = chartStats(analysisOf([post('1', '2026-06-01T01:00:00.000Z')]))
    expect(counts(llmProbability.all)).toEqual(new Array(10).fill(0))
    expect(counts(llmProbability.gold)).toEqual(new Array(10).fill(0))
    expect(counts(clefProbability)).toEqual(new Array(10).fill(0))
  })
})

describe('chartStats の月別', () => {
  test('月は JST で数える。UTC の月末は JST では翌月になる', () => {
    const analysis = analysisOf([
      // JST では 2026-05-31 23:59 と 2026-06-01 00:00
      post('1', '2026-05-31T14:59:59.000Z'),
      post('2', '2026-05-31T15:00:00.000Z'),
      post('3', '2026-06-30T15:30:00.000Z')
    ])
    expect(chartStats(analysis).monthlyPosts).toEqual([
      { month: '2026-05', posts: 1, candidates: 1 },
      { month: '2026-06', posts: 1, candidates: 1 },
      { month: '2026-07', posts: 1, candidates: 1 }
    ])
  })

  test('月別の投稿数は、全投稿とイベント候補を別々に数える', () => {
    const analysis = analysisOf([
      post('1', '2026-06-01T01:00:00.000Z'),
      retweet('2', '2026-06-02T01:00:00.000Z'),
      post('3', '2026-06-03T01:00:00.000Z', { text: '今日はいい天気です' })
    ])
    // 3 件目はキーワードを含まないので候補にならない
    expect(chartStats(analysis).monthlyPosts).toEqual([{ month: '2026-06', posts: 3, candidates: 1 }])
  })

  test('間の月は 0 で埋めて、最初の月から最後の月まで連続させる（年またぎも）', () => {
    const analysis = analysisOf([post('1', '2025-11-10T01:00:00.000Z'), post('2', '2026-02-10T01:00:00.000Z')])
    expect(chartStats(analysis).monthlyPosts).toEqual([
      { month: '2025-11', posts: 1, candidates: 1 },
      { month: '2025-12', posts: 0, candidates: 0 },
      { month: '2026-01', posts: 0, candidates: 0 },
      { month: '2026-02', posts: 1, candidates: 1 }
    ])
  })

  test('D1 イベントの月は startDate の JST 月で数え、投稿の無い月も範囲に含めて 0 で埋める', () => {
    const analysis = analysisOf(
      [post('1', '2026-06-01T01:00:00.000Z')],
      [
        // UTC では 5 月末だが、JST では 6 月 1 日
        gold(EVENT_ID_A, '2026-05-31T15:00:00.000Z'),
        gold(EVENT_ID_B, '2026-08-10T00:00:00.000Z')
      ]
    )
    expect(chartStats(analysis).monthlyEvents).toEqual([
      { month: '2026-06', llm: 0, llmEnded: 0, d1: 1 },
      { month: '2026-07', llm: 0, llmEnded: 0, d1: 0 },
      { month: '2026-08', llm: 0, llmEnded: 0, d1: 1 }
    ])
  })

  test('LLM イベントの月は startDate、無ければ firstSeen の JST 月。終了は endedAt、無ければ endDate の月', () => {
    const analysis = analysisOf([post('1', '2026-06-01T01:00:00.000Z')])
    const { monthlyEvents } = chartStats(analysis, judgements(), [
      // startDate がある: 暦日をそのまま JST の日付として読む（firstSeen は使わない）。終了は追えていない
      emulatedEntry({ startDate: '2026-06-10', firstSeen: Date.parse('2026-03-01T00:00:00.000Z') }),
      // startDate が無い: firstSeen（UTC の 6 月末は JST では 7 月）
      emulatedEntry({ firstSeen: Date.parse('2026-06-30T15:30:00.000Z') }),
      // 開始 6 月・終了報告 8 月
      emulatedEntry({ startDate: '2026-06-20', endedAt: '2026-08-02' }),
      // 開始を見ていない（startDate なし）が終了報告はある: 開始は firstSeen の月、終了は endedAt の月
      emulatedEntry({ firstSeen: Date.parse('2026-07-05T01:00:00.000Z'), endedAt: '2026-07-31' }),
      // 終了報告は無く、告知の終了予定日だけある: 終了は endDate の月
      emulatedEntry({ startDate: '2026-06-25', endDate: '2026-09-15' }),
      // 終了報告も終了予定日もある: endedAt の月に 1 回だけ数える（endDate の月には数えない）
      emulatedEntry({ startDate: '2026-06-26', endDate: '2026-09-20', endedAt: '2026-08-10' })
    ])
    expect(monthlyEvents).toEqual([
      { month: '2026-06', llm: 4, llmEnded: 0, d1: 0 },
      { month: '2026-07', llm: 2, llmEnded: 1, d1: 0 },
      { month: '2026-08', llm: 0, llmEnded: 2, d1: 0 },
      { month: '2026-09', llm: 0, llmEnded: 1, d1: 0 }
    ])
  })

  test('月別の終了の合計は、統計の終了（totals.emulatedEnded）と一致する', () => {
    const analysis = analysisOf([post('1', '2026-06-01T01:00:00.000Z')])
    const entries = [
      emulatedEntry({ startDate: '2026-06-10' }),
      emulatedEntry({ startDate: '2026-06-20', endedAt: '2026-08-02' }),
      emulatedEntry({ startDate: '2026-06-25', endDate: '2026-09-15' }),
      emulatedEntry({ startDate: '2026-06-26', endDate: '2026-09-20', endedAt: '2026-08-10' }),
      // 終了予定日が未来でも終了として数える
      emulatedEntry({ startDate: '2026-06-27', endDate: '2099-12-31' })
    ]
    const monthlyEnded = chartStats(analysis, judgements(), entries).monthlyEvents.reduce(
      (total, row) => total + row.llmEnded,
      0
    )
    const { years } = postStats(analysis, [], undefined, entries)
    const statsEnded = years.reduce((total, year) => total + year.emulatedEnded, 0)
    expect(statsEnded).toBe(4)
    expect(monthlyEnded).toBe(statsEnded)
  })

  test('投稿が無くても、イベントがあれば月別イベント数に出る。何も無ければ空', () => {
    expect(chartStats(analysisOf([])).monthlyPosts).toEqual([])
    expect(chartStats(analysisOf([])).monthlyEvents).toEqual([])
    expect(
      chartStats(analysisOf([]), judgements(), [emulatedEntry({ startDate: '2026-06-10' })]).monthlyEvents
    ).toEqual([{ month: '2026-06', llm: 1, llmEnded: 0, d1: 0 }])
  })
})

describe('chartStats の店舗別', () => {
  test('LLM イベント数の降順で並べ、同数は店舗キーの昇順にする', () => {
    const entries = [
      ...new Array(3).fill('b'),
      ...new Array(5).fill('a'),
      ...new Array(3).fill('c'),
      ...new Array(1).fill('d')
    ].map((store) => emulatedEntry({ store, startDate: '2026-06-10' }))
    expect(chartStats(analysisOf([]), judgements(), entries).stores).toEqual([
      { store: 'a', count: 5 },
      { store: 'b', count: 3 },
      { store: 'c', count: 3 },
      { store: 'd', count: 1 }
    ])
  })

  test('上位 20 店舗だけを返す', () => {
    // store00 は 1 件、store01 は 2 件、…、store24 は 25 件。多い方の 20 店舗（store05〜store24）が残る
    const entries = Array.from({ length: 25 }, (_, index) =>
      Array.from({ length: index + 1 }, () =>
        emulatedEntry({ store: `store${String(index).padStart(2, '0')}`, startDate: '2026-06-10' })
      )
    ).flat()
    const { stores } = chartStats(analysisOf([]), judgements(), entries)
    expect(stores).toHaveLength(20)
    expect(stores[0]).toEqual({ store: 'store24', count: 25 })
    expect(stores[19]).toEqual({ store: 'store05', count: 6 })
    expect(stores.map((entry) => entry.count)).toEqual([...stores.map((entry) => entry.count)].sort((a, b) => b - a))
  })
})

describe('chartStats でエミュレート結果が無いとき', () => {
  test('LLM イベント・LLM 終了は 0、店舗別は空。D1 イベントとヒストグラムはそのまま数える', () => {
    const analysis = analysisOf(
      [post('1', '2026-06-01T01:00:00.000Z')],
      [gold(EVENT_ID_A, '2026-06-10T15:00:00.000Z', '1')]
    )
    const result = chartStats(analysis, judgements([['1', 0.95]]))
    expect(result.monthlyEvents).toEqual([{ month: '2026-06', llm: 0, llmEnded: 0, d1: 1 }])
    expect(result.stores).toEqual([])
    expect(counts(result.llmProbability.all)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(counts(result.llmProbability.gold)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
  })
})
