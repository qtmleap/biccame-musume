import { describe, expect, test } from 'bun:test'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { EmulatedFile } from '../../scripts/lib/event-detect/analysis'
import { createApi } from '../../scripts/lib/event-detect/api'
import type { GoldEvent } from '../../scripts/lib/event-detect/gold'
import {
  EmulatedDetailResponseSchema,
  EmulatedResponseSchema,
  SummarySchema
} from '../../scripts/lib/event-detect/schema'

// LLM イベント（emulate が作ったイベント）の一覧と詳細の API。

type EmulatedRecord = EmulatedFile['events'][number]

const SUMMER_ID = '00000000-0000-4000-8000-000000000001'
const WINTER_ID = '00000000-0000-4000-8000-000000000002'

const post = (id: string, day: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
  id,
  createdAt: `${day}T01:00:00.000Z`,
  screenName: 'bic_example',
  kind: 'original',
  text: `名刺を配布します ${id}`,
  url: `https://x.com/bic_example/status/${id}`,
  media: [],
  ...overrides
})

/** 投稿 101〜107 は分析にある。999・998 は分析に無い（記念日より前などで取り込まれなかった投稿） */
const posts = (): DetectPost[] => [
  post('101', '2026-06-01'),
  post('102', '2026-06-10'),
  post('103', '2026-07-01'),
  post('104', '2025-05-02'),
  post('105', '2025-03-01'),
  post('106', '2025-03-05'),
  post('107', '2026-08-01', { screenName: 'bic_other', url: 'https://x.com/bic_other/status/107' })
]

const goldEvent = (uuid: string, title: string, referenceUrls: GoldEvent['referenceUrls']): GoldEvent => ({
  uuid,
  title,
  category: 'limited_card',
  stores: ['example'],
  startDate: '2026-06-10T15:00:00.000Z',
  conditions: [],
  isPreliminary: false,
  referenceUrls
})

/** 投稿 101・102 は夏名刺、103 は冬名刺の参考 URL */
const goldEvents = (): GoldEvent[] => [
  goldEvent(SUMMER_ID, '夏名刺', [
    { type: 'announce', url: 'https://x.com/bic_example/status/101' },
    { type: 'start', url: 'https://x.com/bic_example/status/102' }
  ]),
  goldEvent(WINTER_ID, '冬名刺', [{ type: 'announce', url: 'https://x.com/bic_example/status/103' }])
]

const record = (
  fields: Pick<EmulatedRecord, 'id' | 'store' | 'item' | 'firstSeen'> & Partial<EmulatedRecord>
): EmulatedRecord => ({
  category: 'limited_card',
  status: 'ongoing',
  startUnknown: false,
  lastSeen: fields.firstSeen,
  posts: [],
  ...fields
})

const time = (day: string) => Date.parse(`${day}T01:00:00.000Z`)

/**
 * example-1: 夏名刺。101・102 に言及（どちらも夏名刺の参考 URL）と、分析に無い 999。2026 年、終了報告あり
 * example-2: 夏名刺の作りすぎ。101（夏名刺）と 103（冬名刺）に言及。言及の並びは新しい順で書く。2026 年、終了なし
 * other-1: アクキー。104 だけで D1 に当たらない。店舗は example でない。開始日が無いので最初の言及の 2025 年、終了予定日あり
 * example-3: 春名刺。105 に 2 回（開始と終了）、106 に 1 回。再確認は 2 つの言及にあり、index の小さい方を使う。2025 年
 * example-4: 分析に無い投稿だけ。言及 0 件でも行になる。最初の言及の 2026 年
 */
const emulatedRecords = (): EmulatedRecord[] => [
  record({
    id: 'example-1',
    store: 'example',
    item: '夏名刺',
    status: 'end',
    startDate: '2026-06-10',
    endedAt: '2026-07-01',
    firstSeen: time('2026-06-01'),
    lastSeen: time('2026-07-01'),
    posts: [
      { postId: '101', status: 'announce', index: 0 },
      { postId: '102', status: 'start', index: 0 },
      { postId: '999', status: 'end', index: 0 }
    ]
  }),
  record({
    id: 'example-2',
    store: 'example',
    item: '夏名刺 2',
    startDate: '2026-06-20',
    quantity: 100,
    firstSeen: time('2026-06-02'),
    lastSeen: time('2026-07-02'),
    posts: [
      { postId: '103', status: 'announce', index: 0 },
      { postId: '101', status: 'ongoing', index: 1 }
    ]
  }),
  record({
    id: 'other-1',
    store: 'other',
    item: 'アクキー',
    status: 'announce',
    endDate: '2025-06-01',
    startUnknown: true,
    firstSeen: time('2025-05-02'),
    lastSeen: time('2025-05-02'),
    posts: [{ postId: '104', status: 'announce', index: 0 }]
  }),
  record({
    id: 'example-3',
    store: 'example',
    item: '春名刺',
    status: 'end',
    startDate: '2025-03-01',
    firstSeen: time('2025-03-01'),
    lastSeen: time('2025-03-05'),
    posts: [
      { postId: '105', status: 'start', index: 2, verify: { choice: 'example-9', probability: 0.4, merged: false } },
      { postId: '105', status: 'end', index: 1, verify: { choice: 'example-3', probability: 0.8, merged: true } },
      { postId: '106', status: 'ongoing', index: 0 }
    ]
  }),
  record({
    id: 'example-4',
    store: 'example',
    item: 'ＺＥＲＯ',
    firstSeen: time('2026-05-01'),
    posts: [{ postId: '998', status: 'announce', index: 0 }]
  })
]

/** 既定は emulatedRecords を読んだ結果。'none' は emulate を実行していない（結果ファイルが無い）状態 */
const setup = (
  emulated: EmulatedFile | 'none' = { emulatedAt: '2026-10-09T03:00:00.000Z', events: emulatedRecords() }
) => {
  const api = createApi({
    posts: posts(),
    events: goldEvents(),
    accounts: [
      { storeId: 'example', name: '例たん', screenName: 'bic_example' },
      { storeId: 'other', name: '他たん', screenName: 'bic_other' }
    ],
    characterNames: ['例たん'],
    source: { archive: '/tmp/posts.jsonl', complete: true, pages: 1, goldFetchedAt: '2026-10-08T00:00:00.000Z' },
    labels: {},
    judgements: { llm: new Map(), clef: new Map() },
    emulated: emulated === 'none' ? undefined : emulated,
    saveLabels: async () => {},
    readGapEvents: async () => undefined,
    now: () => '2026-10-08T01:00:00.000Z'
  })
  return (path: string) => api.handle(new Request(`http://localhost${path}`))
}

/** 一覧を取り、スキーマに通した結果を返す */
const list = async (call: ReturnType<typeof setup>, query = '') => {
  const response = await call(`/api/emulated${query}`)
  expect(response.status).toBe(200)
  const parsed = EmulatedResponseSchema.safeParse(await response.json())
  expect(parsed.success).toBe(true)
  if (!parsed.success) throw new Error(parsed.error.message)
  return parsed.data
}

const ids = (data: { events: { id: string }[] }) => data.events.map((event) => event.id)

describe('GET /api/emulated', () => {
  test('既定は最初の言及の新しい順で、行は共通の項目を持つ', async () => {
    const data = await list(setup())
    expect(data.total).toBe(5)
    expect(data.emulatedAt).toBe('2026-10-09T03:00:00.000Z')
    expect(ids(data)).toEqual(['example-2', 'example-1', 'example-4', 'other-1', 'example-3'])
    const [first] = data.events.filter((event) => event.id === 'example-1')
    expect(first).toEqual({
      id: 'example-1',
      store: 'example',
      item: '夏名刺',
      category: 'limited_card',
      status: 'end',
      startDate: '2026-06-10',
      endedAt: '2026-07-01',
      startUnknown: false,
      firstSeen: '2026-06-01T01:00:00.000Z',
      lastSeen: '2026-07-01T01:00:00.000Z',
      year: 2026,
      // 999 は分析に無いので数えない
      mentions: 2,
      ended: true,
      d1: [{ eventId: SUMMER_ID, title: '夏名刺' }]
    })
  })

  test('年は開始日の年で、無ければ最初の言及の JST 年。facets は絞り込む前の全体', async () => {
    const data = await list(setup(), '?year=2025')
    expect(ids(data).sort()).toEqual(['example-3', 'other-1'])
    expect(data.total).toBe(2)
    // 絞り込んでも facets は動かない。年は新しい順、店舗は件数の降順
    expect(data.facets).toEqual({
      years: [
        { year: 2026, count: 3 },
        { year: 2025, count: 2 }
      ],
      stores: [
        { store: 'example', count: 4 },
        { store: 'other', count: 1 }
      ]
    })
  })

  test('店舗・状態・終了・D1・配布物名で絞り込む', async () => {
    const call = setup()
    expect(ids(await list(call, '?store=other'))).toEqual(['other-1'])
    expect(ids(await list(call, '?status=end')).sort()).toEqual(['example-1', 'example-3'])
    // 終了は終了報告か終了予定日がある（other-1 は予定日だけ）
    expect(ids(await list(call, '?ended=1')).sort()).toEqual(['example-1', 'other-1'])
    expect(ids(await list(call, '?ended=0')).sort()).toEqual(['example-2', 'example-3', 'example-4'])
    expect(ids(await list(call, '?d1=matched')).sort()).toEqual(['example-1', 'example-2'])
    expect(ids(await list(call, '?d1=none')).sort()).toEqual(['example-3', 'example-4', 'other-1'])
    expect(ids(await list(call, `?q=${encodeURIComponent('夏')}`)).sort()).toEqual(['example-1', 'example-2'])
  })

  test('配布物名の検索は normalizeText 済みで比べる（全角・半角、空白の差を吸収する）', async () => {
    const call = setup()
    // 項目は全角の ＺＥＲＯ。NFKC で半角にそろえるので、半角の ZERO で当たる
    expect(ids(await list(call, '?q=ZERO'))).toEqual(['example-4'])
    // 空白は取り除いて比べる
    expect(ids(await list(call, `?q=${encodeURIComponent('夏名刺 2')}`))).toEqual(['example-2'])
    expect(ids(await list(call, `?q=${encodeURIComponent('夏 名刺')}`)).sort()).toEqual(['example-1', 'example-2'])
    expect((await list(call, `?q=${encodeURIComponent('存在しない')}`)).total).toBe(0)
  })

  test('絞り込みは AND で効く', async () => {
    const call = setup()
    expect(ids(await list(call, '?year=2026&store=example&d1=matched&ended=1'))).toEqual(['example-1'])
    expect(ids(await list(call, '?year=2025&store=example'))).toEqual(['example-3'])
    expect(ids(await list(call, `?year=2026&ended=0&q=${encodeURIComponent('夏')}`))).toEqual(['example-2'])
    expect((await list(call, '?year=2026&store=other')).total).toBe(0)
  })

  test('既定の並びは最初の言及の降順で、向きを指定すると昇順にできる', async () => {
    const call = setup()
    expect(ids(await list(call, '?sort=firstSeen'))).toEqual(ids(await list(call)))
    expect(ids(await list(call, '?sort=firstSeen&order=asc'))).toEqual(ids(await list(call)).reverse())
  })

  test('最後の言及・言及の数で並べ替える（既定は降順）', async () => {
    const call = setup()
    expect(ids(await list(call, '?sort=lastSeen'))).toEqual([
      'example-2',
      'example-1',
      'example-4',
      'other-1',
      'example-3'
    ])
    const byMentions = await list(call, '?sort=mentions')
    expect(byMentions.events.map((event) => event.mentions)).toEqual([2, 2, 2, 1, 0])
    const ascending = await list(call, '?sort=mentions&order=asc')
    expect(ascending.events.map((event) => event.mentions)).toEqual([0, 1, 2, 2, 2])
  })

  test('店舗の並びは昇順が既定で、同じ店舗の中は最初の言及の新しい順', async () => {
    const call = setup()
    const store = await list(call, '?sort=store')
    expect(store.events.map((event) => event.store)).toEqual(['example', 'example', 'example', 'example', 'other'])
    expect(ids(store)).toEqual(['example-2', 'example-1', 'example-4', 'example-3', 'other-1'])
    expect(ids(await list(call, '?sort=store&order=desc'))[0]).toBe('other-1')
  })

  test('offset と limit でページを切り、total は切る前の件数', async () => {
    const call = setup()
    const all = ids(await list(call))
    const page = await list(call, '?offset=2&limit=2')
    expect(page.total).toBe(5)
    expect(ids(page)).toEqual(all.slice(2, 4))
    expect(ids(await list(call, '?offset=4&limit=2'))).toEqual(all.slice(4))
    expect(ids(await list(call, '?offset=99'))).toEqual([])
  })

  test('d1 は言及の投稿のうち参考 URL になっているものから集め、重複を除く（複数の D1 イベントにも当たる）', async () => {
    const data = await list(setup())
    const d1 = (id: string) => data.events.find((event) => event.id === id)?.d1
    // 101・102 はどちらも夏名刺の参考 URL。1 件にまとまる
    expect(d1('example-1')).toEqual([{ eventId: SUMMER_ID, title: '夏名刺' }])
    // 101（夏名刺）と 103（冬名刺）の両方。言及の古い順（101 が先）
    expect(d1('example-2')).toEqual([
      { eventId: SUMMER_ID, title: '夏名刺' },
      { eventId: WINTER_ID, title: '冬名刺' }
    ])
    expect(d1('other-1')).toEqual([])
    // 分析に無い投稿だけのイベントは、D1 にも当たらない
    expect(d1('example-4')).toEqual([])
  })

  test('分析に無い投稿は言及に数えないが、言及 0 件のイベントも行になる', async () => {
    const data = await list(setup())
    expect(data.events.find((event) => event.id === 'example-4')).toMatchObject({ mentions: 0, year: 2026 })
    // 同じ投稿に言及が 2 回あっても 1 件（105 が 2 回、106 が 1 回）
    expect(data.events.find((event) => event.id === 'example-3')?.mentions).toBe(2)
  })

  test('総数は summary の年別・年別の終了・アカウント別の数と一致する', async () => {
    const call = setup()
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error(parsed.error.message)
    const summary = parsed.data
    for (const year of summary.years) {
      expect((await list(call, `?year=${year.year}`)).total).toBe(year.emulated)
      expect((await list(call, `?year=${year.year}&ended=1`)).total).toBe(year.emulatedEnded)
    }
    expect((await list(call, '')).total).toBe(summary.totals.emulated)
    expect((await list(call, '?ended=1')).total).toBe(summary.totals.emulatedEnded)
    const withStore = summary.accounts.flatMap((account) =>
      account.store === null ? [] : [{ ...account, store: account.store }]
    )
    expect(withStore.length).toBeGreaterThan(0)
    for (const account of withStore) {
      expect((await list(call, `?store=${account.store}`)).total).toBe(account.emulated)
      expect((await list(call, `?store=${account.store}&ended=1`)).total).toBe(account.emulatedEnded)
    }
    // 取り違えていないことの確認として、期待する具体的な数も置く
    expect(summary.years.map(({ year, emulated, emulatedEnded }) => [year, emulated, emulatedEnded])).toEqual([
      [2025, 2, 1],
      [2026, 3, 1]
    ])
  })

  test('不正なクエリは 400', async () => {
    const call = setup()
    for (const query of [
      '?year=abc',
      '?status=unknown',
      '?ended=2',
      '?d1=maybe',
      '?sort=item',
      '?order=up',
      '?limit=501',
      '?limit=0',
      '?offset=-1'
    ]) {
      expect((await call(`/api/emulated${query}`)).status).toBe(400)
    }
  })

  test('結果ファイルが無ければ、空の応答で emulatedAt が null', async () => {
    const data = await list(setup('none'), '?year=2026')
    expect(data).toEqual({ total: 0, events: [], facets: { years: [], stores: [] }, emulatedAt: null })
  })
})

describe('GET /api/emulated/:id', () => {
  const detail = async (call: ReturnType<typeof setup>, id: string) => {
    const response = await call(`/api/emulated/${id}`)
    expect(response.status).toBe(200)
    const parsed = EmulatedDetailResponseSchema.safeParse(await response.json())
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error(parsed.error.message)
    return parsed.data
  }

  test('言及は古い順で、分析に無い投稿は含めない。行は一覧と同じ', async () => {
    const call = setup()
    const data = await detail(call, 'example-1')
    expect(data.posts.map((entry) => entry.post.id)).toEqual(['101', '102'])
    expect(data.posts.map((entry) => entry.status)).toEqual(['announce', 'start'])
    const row = (await list(call)).events.find((event) => event.id === 'example-1')
    expect(row).toEqual(data.event)
    expect(data.event.mentions).toBe(data.posts.length)
  })

  test('レコードの言及が新しい順に書かれていても、投稿の時刻の古い順に返す', async () => {
    const data = await detail(setup(), 'example-2')
    // 記録は 103（7/1）、101（6/1）の順
    expect(data.posts.map((entry) => entry.post.id)).toEqual(['101', '103'])
    // 参考 URL になっている投稿は、投稿の表示にも正解が付く
    expect(data.posts.map((entry) => entry.post.gold.map((gold) => gold.title))).toEqual([['夏名刺'], ['冬名刺']])
  })

  test('同じ投稿の言及は 1 件にまとめ、状態は最も進んだもの、verify は index が最小のもの', async () => {
    const data = await detail(setup(), 'example-3')
    expect(data.posts.map((entry) => [entry.post.id, entry.status])).toEqual([
      ['105', 'end'],
      ['106', 'ongoing']
    ])
    expect(data.posts[0].verify).toEqual({ choice: 'example-3', probability: 0.8, merged: true })
    // 再確認をしていない言及には verify が付かない
    expect(data.posts[1]).not.toHaveProperty('verify')
  })

  test('言及が 0 件のイベントも詳細を返す', async () => {
    const data = await detail(setup(), 'example-4')
    expect(data.posts).toEqual([])
    expect(data.event.mentions).toBe(0)
  })

  test('存在しない id・不正な id・結果ファイルが無いときは 404', async () => {
    const call = setup()
    expect((await call('/api/emulated/nothing-1')).status).toBe(404)
    expect((await call('/api/emulated/a%20b')).status).toBe(404)
    expect((await call('/api/emulated/a.b')).status).toBe(404)
    expect((await setup('none')('/api/emulated/example-1')).status).toBe(404)
  })
})
