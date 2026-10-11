import { describe, expect, test } from 'bun:test'
import { ChartsResponseSchema } from '@biccame/shared/event-detect/charts'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import type { EmulatedFile, Judgements } from '../../scripts/lib/event-detect/analysis'
import { createApi } from '../../scripts/lib/event-detect/api'
import { fetchGoldEvents, type GoldEvent } from '../../scripts/lib/event-detect/gold'
import {
  EventDetailResponseSchema,
  KeywordsResponseSchema,
  LabelResponseSchema,
  type Labels,
  PostsResponseSchema,
  SummarySchema
} from '../../scripts/lib/event-detect/schema'

const EVENT_ID = '00000000-0000-4000-8000-000000000001'

const post = (id: string, text: string, overrides: Partial<DetectPost> = {}): DetectPost => ({
  id,
  createdAt: '2026-06-01T01:00:00.000Z',
  screenName: 'bic_example',
  kind: 'original',
  text,
  url: `https://x.com/bic_example/status/${id}`,
  media: [],
  ...overrides
})

const event: GoldEvent = {
  uuid: EVENT_ID,
  title: '夏名刺',
  category: 'limited_card',
  stores: ['example'],
  startDate: '2026-06-10T15:00:00.000Z',
  conditions: [{ type: 'first_come', quantity: 100 }],
  isPreliminary: false,
  referenceUrls: [{ type: 'announce', url: 'https://x.com/bic_example/status/1' }]
}

const basePosts = (): DetectPost[] => [
  post('1', '6/11から夏名刺を配布します'),
  post('2', 'RT: 名刺', { kind: 'retweet' }),
  post('3', 'アクキーかわいい', { createdAt: '2026-06-02T01:00:00.000Z' })
]

/** emulate の結果 1 件。統計に使わない項目（配布物名・言及など）は固定値で埋める */
const emulatedRecord = (
  fields: Pick<EmulatedFile['events'][number], 'store' | 'firstSeen'> &
    Partial<Pick<EmulatedFile['events'][number], 'startDate' | 'endDate' | 'endedAt'>>
): EmulatedFile['events'][number] => ({
  id: `${fields.store}-1`,
  item: '夏名刺',
  category: 'limited_card',
  status: 'ongoing',
  startUnknown: false,
  lastSeen: fields.firstSeen,
  posts: [],
  ...fields
})

const setup = (
  extraPosts: DetectPost[] = [],
  judgements: Judgements = { llm: new Map(), clef: new Map() },
  base: DetectPost[] = basePosts(),
  emulated: EmulatedFile | undefined = undefined,
  events: GoldEvent[] = [event]
) => {
  const saved: Labels[] = []
  const api = createApi({
    posts: [...base, ...extraPosts],
    events,
    accounts: [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }],
    characterNames: ['例たん'],
    source: {
      archive: '/tmp/posts.jsonl',
      complete: false,
      pages: 10,
      goldFetchedAt: '2026-10-08T00:00:00.000Z'
    },
    labels: {},
    judgements,
    emulated,
    saveLabels: async (labels) => {
      saved.push(labels)
    },
    readGapEvents: async () => undefined,
    now: () => '2026-10-08T01:00:00.000Z'
  })
  const call = (path: string, init?: RequestInit) => api.handle(new Request(`http://localhost${path}`, init))
  return { call, saved }
}

describe('event detect api', () => {
  test('summary はスキーマどおりの形で返す', async () => {
    const { call } = setup()
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.source).toMatchObject({
      posts: 3,
      events: 1,
      oldest: '2026-06-01T01:00:00.000Z',
      newest: '2026-06-02T01:00:00.000Z',
      complete: false,
      pages: 10,
      // emulate を実行していなければ null
      emulatedAt: null
    })
    // 投稿 2 はリツイートなので候補から外れる。投稿 1 は D1 イベントの参考 URL が指している
    const counts = { posts: 3, candidates: 2, goldPosts: 1, events: 1 }
    // 判定のキャッシュが無ければ、llm・clef とその判定済みは年別も合計も 0。アカウント別には持たない
    const none = { llm: 0, llmJudged: 0, clef: 0, clefJudged: 0 }
    // emulate の結果が無ければ、emulated・emulatedEnded は年別・アカウント別・合計のすべてで 0
    const noEmulated = { emulated: 0, emulatedEnded: 0 }
    expect(parsed.data?.totals).toEqual({ ...counts, ...none, ...noEmulated, accounts: 1, storeAccounts: 1 })
    expect(parsed.data?.years).toEqual([{ year: 2026, ...counts, ...none, ...noEmulated }])
    expect(parsed.data?.accounts).toEqual([{ screenName: 'bic_example', store: 'example', ...counts, ...noEmulated }])
    expect(parsed.data?.labels).toEqual({ total: 0, event: 0, notEvent: 0, unsure: 0 })
  })

  test('summary は判定のキャッシュから LLM・Clef の件数を年別に数え、合計は年別の和にする', async () => {
    const { call } = setup([post('4', '5/1から春名刺を配布します', { createdAt: '2025-05-01T01:00:00.000Z' })], {
      // 投稿 2 はリツイートで候補でないので、判定があっても数えない。投稿 3 は 0.5 未満で判定済みだけ
      llm: new Map([
        ['1', 0.8],
        ['2', 0.9],
        ['3', 0.49],
        ['4', 0.5]
      ]),
      clef: new Map([
        ['1', 0.3],
        ['4', 0.7]
      ])
    })
    const body = await (await call('/api/summary')).json()
    const parsed = SummarySchema.safeParse(body)
    expect(parsed.success).toBe(true)
    expect(
      parsed.data?.years.map(({ year, llm, llmJudged, clef, clefJudged }) => [year, llm, llmJudged, clef, clefJudged])
    ).toEqual([
      [2025, 1, 1, 1, 1],
      [2026, 1, 2, 0, 1]
    ])
    expect(parsed.data?.totals).toMatchObject({ llm: 2, llmJudged: 3, clef: 1, clefJudged: 2 })
    // アカウント別には判定の件数を持たない。SummarySchema は未知のキーを落とすので、生の応答で確かめる
    const raw = z.object({ accounts: z.array(z.record(z.string().nonempty(), z.unknown())) }).safeParse(body)
    const judgementKeys = ['llm', 'llmJudged', 'clef', 'clefJudged']
    expect(
      raw.data?.accounts.map((account) => Object.keys(account).filter((key) => judgementKeys.includes(key)))
    ).toEqual([[]])
  })

  test('summary は emulate の結果を年別・アカウント別に数え、合計は年別の和にして、更新時刻を返す', async () => {
    const emulated: EmulatedFile = {
      emulatedAt: '2026-10-09T03:00:00.000Z',
      events: [
        emulatedRecord({
          store: 'example',
          startDate: '2025-05-01',
          endedAt: '2025-06-01',
          firstSeen: Date.parse('2025-05-01T01:00:00Z')
        }),
        // 開始日が無ければ最初の言及の年（2026 年）。開始を見ていないものも数える。終了予定日だけでも終了に数える
        emulatedRecord({ store: 'example', endDate: '2026-06-30', firstSeen: Date.parse('2026-06-02T01:00:00Z') }),
        // アカウントの無い店舗のイベントは、年別と合計にだけ数える
        emulatedRecord({
          store: 'ghost',
          startDate: '2026-07-01',
          endedAt: '2026-07-09',
          firstSeen: Date.parse('2026-06-30T01:00:00Z')
        })
      ]
    }
    const { call } = setup(
      [post('4', '5/1から春名刺を配布します', { createdAt: '2025-05-01T01:00:00.000Z' })],
      undefined,
      undefined,
      emulated
    )
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.source.emulatedAt).toBe('2026-10-09T03:00:00.000Z')
    expect(parsed.data?.years.map(({ year, emulated, emulatedEnded }) => [year, emulated, emulatedEnded])).toEqual([
      [2025, 1, 1],
      [2026, 2, 2]
    ])
    expect(parsed.data?.totals).toMatchObject({ emulated: 3, emulatedEnded: 3 })
    expect(
      parsed.data?.accounts.map(({ screenName, emulated, emulatedEnded }) => [screenName, emulated, emulatedEnded])
    ).toEqual([['bic_example', 2, 2]])
  })

  test('summary のアカウント別は最初・最新の投稿日時を持たない', async () => {
    const { call } = setup()
    const body = await (await call('/api/summary')).json()
    // SummarySchema は未知のキーを落とすので、生の応答で確かめる
    const raw = z.object({ accounts: z.array(z.record(z.string().nonempty(), z.unknown())) }).safeParse(body)
    expect(raw.data?.accounts.map((account) => Object.keys(account).sort())).toEqual([
      ['candidates', 'emulated', 'emulatedEnded', 'events', 'goldPosts', 'posts', 'screenName', 'store']
    ])
  })

  test('summary の source.oldest・newest は、複数アカウントをまたいだ全投稿の最古・最新になる', async () => {
    // 最古も最新も、投稿数の多い bic_example ではなく別アカウントの投稿
    const { call } = setup([
      post('4', 'おはようございます', {
        screenName: 'someone',
        createdAt: '2015-04-26T15:16:22.000Z',
        url: 'https://x.com/someone/status/4'
      }),
      post('5', 'こんばんは', {
        screenName: 'other_account',
        createdAt: '2026-10-08T09:26:13.000Z',
        url: 'https://x.com/other_account/status/5'
      })
    ])
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.data?.source).toMatchObject({
      posts: 5,
      oldest: '2015-04-26T15:16:22.000Z',
      newest: '2026-10-08T09:26:13.000Z'
    })
  })

  test('summary は投稿が 0 件なら source.oldest・newest を null にする', async () => {
    const { call } = setup([], undefined, [])
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.source).toMatchObject({ posts: 0, oldest: null, newest: null })
    expect(parsed.data?.accounts).toEqual([])
  })

  test('summary は characters.json に無いアカウントの store を null にして、店舗アカウント数に数えない', async () => {
    const { call } = setup([
      post('4', 'おはようございます', { screenName: 'someone', url: 'https://x.com/someone/status/4' })
    ])
    const parsed = SummarySchema.safeParse(await (await call('/api/summary')).json())
    expect(parsed.data?.totals).toMatchObject({ accounts: 2, storeAccounts: 1 })
    expect(parsed.data?.accounts.map((account) => [account.screenName, account.store, account.events])).toEqual([
      ['bic_example', 'example', 1],
      ['someone', null, 0]
    ])
  })

  test('posts は範囲で絞り、新しい順に返す', async () => {
    const { call } = setup()
    const passed = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=passed')).json())
    expect(passed.data?.posts.map((entry) => entry.id)).toEqual(['3', '1'])
    const unlabeled = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=unlabeled')).json())
    expect(unlabeled.data?.posts.map((entry) => entry.id)).toEqual(['3'])
    const dropped = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=dropped&reason=retweet')).json())
    expect(dropped.data?.total).toBe(1)
  })

  test('posts の不正なクエリは 400', async () => {
    const { call } = setup()
    expect((await call('/api/posts?scope=unknown')).status).toBe(400)
  })

  describe('posts の確率の区間での絞り込み（judge + bin）', () => {
    // 投稿 1 は D1 の参考 URL が指す正解、2 はリツイート（候補でない）、3〜6 は候補。
    // 投稿 7 は除外されたリツイートで、これも参考 URL が指す（除外された正解）
    const candidate = (id: string, day: string) =>
      post(id, `名刺を配布します ${id}`, { createdAt: `${day}T01:00:00.000Z` })
    const extra = [
      candidate('4', '2026-06-03'),
      candidate('5', '2026-06-04'),
      candidate('6', '2026-06-05'),
      post('7', 'RT: 名刺を配布します', { kind: 'retweet', createdAt: '2026-06-06T01:00:00.000Z' })
    ]
    const goldEvent: GoldEvent = {
      ...event,
      referenceUrls: [
        { type: 'announce', url: 'https://x.com/bic_example/status/1' },
        { type: 'end', url: 'https://x.com/bic_example/status/7' }
      ]
    }
    // 0.1 ちょうどは区間 1、1.0 は区間 9。投稿 2・7 は候補でないので、区間に入る確率でも数えない
    const judgements: Judgements = {
      llm: new Map([
        ['1', 0.95],
        ['2', 0.95],
        ['3', 0.1],
        ['4', 1],
        ['5', 0.95],
        ['6', 0],
        ['7', 0.95]
      ]),
      clef: new Map([
        ['1', 0.99],
        ['4', 0.99],
        ['5', 0.3],
        ['7', 0.99]
      ])
    }
    const run = () => setup(extra, judgements, basePosts(), undefined, [goldEvent])
    const listOf = async (call: ReturnType<typeof setup>['call'], query: string) => {
      const parsed = PostsResponseSchema.safeParse(await (await call(`/api/posts?${query}`)).json())
      if (!parsed.success) throw new Error(parsed.error.message)
      return parsed.data
    }
    const ids = (data: { posts: { id: string }[] }) => data.posts.map((entry) => entry.id)

    test('候補のうち、その判定の確率が区間に入る投稿を確率の降順で返し、同じ確率は新しい順に並べる', async () => {
      const { call } = run()
      // 区間 9: 4（1.0）が先頭で、同じ 0.95 の 5（6/4）と 1（6/1）は新しい順。リツイートの 2・7 は入らない
      const llm = await listOf(call, 'judge=llm&bin=9')
      expect(llm.total).toBe(3)
      expect(ids(llm)).toEqual(['4', '5', '1'])
      // Clef は 4 と 1 が同じ 0.99 で、新しい順に 4、1。7 はリツイートなので入らない
      const clef = await listOf(call, 'judge=clef&bin=9')
      expect(clef.total).toBe(2)
      expect(ids(clef)).toEqual(['4', '1'])
    })

    test('0.1 ちょうどは区間 1、1.0 は区間 9、0 は区間 0 に入る', async () => {
      const { call } = run()
      expect(ids(await listOf(call, 'judge=llm&bin=1'))).toEqual(['3'])
      expect(ids(await listOf(call, 'judge=llm&bin=0'))).toEqual(['6'])
      expect(ids(await listOf(call, 'judge=llm&bin=9'))).toContain('4')
      expect(await listOf(call, 'judge=llm&bin=2')).toMatchObject({ total: 0, posts: [] })
    })

    test('scope=gold と組み合わせると、D1 参考投稿の系列と同じ集合になる（除外された正解は入らない）', async () => {
      const { call } = run()
      // 正解は 1 と 7。7 はリツイートで候補でないので、区間 9 に残るのは 1 だけ
      const gold = await listOf(call, 'scope=gold&judge=llm&bin=9')
      expect(ids(gold)).toEqual(['1'])
      // scope=all でも候補でない投稿は入らない
      expect(ids(await listOf(call, 'scope=all&judge=llm&bin=9'))).toEqual(['4', '5', '1'])
    })

    test('他の絞り込み（アカウント・期間・本文）とは AND で組み合わせる', async () => {
      const { call } = run()
      expect(ids(await listOf(call, 'judge=llm&bin=9&from=2026-06-04'))).toEqual(['5'])
      expect(ids(await listOf(call, 'judge=llm&bin=9&account=someone_else'))).toEqual([])
      expect(ids(await listOf(call, `judge=llm&bin=9&q=${encodeURIComponent('名刺を配布します 5')}`))).toEqual(['5'])
    })

    test('offset と limit は並べ替えた後に効く', async () => {
      const { call } = run()
      const page = await listOf(call, 'judge=llm&bin=9&offset=1&limit=1')
      expect(page.total).toBe(3)
      expect(ids(page)).toEqual(['5'])
    })

    test('total はチャートの区間の件数と一致する（LLM の全体・D1 参考投稿・Clef）', async () => {
      const { call } = run()
      const parsedCharts = ChartsResponseSchema.safeParse(await (await call('/api/charts')).json())
      if (!parsedCharts.success) throw new Error(parsedCharts.error.message)
      const charts = parsedCharts.data
      const totals = async (query: string) =>
        Promise.all(Array.from({ length: 10 }, async (_, bin) => (await listOf(call, `${query}&bin=${bin}`)).total))
      const counts = (bins: { count: number }[]) => bins.map((bin) => bin.count)
      expect(await totals('scope=passed&judge=llm')).toEqual(counts(charts.llmProbability.all))
      expect(await totals('scope=gold&judge=llm')).toEqual(counts(charts.llmProbability.gold))
      expect(await totals('scope=passed&judge=clef')).toEqual(counts(charts.clefProbability))
      // scope の既定は passed で、候補と一致するので指定しなくても同じ
      expect(await totals('judge=llm')).toEqual(counts(charts.llmProbability.all))
    })

    test('judge だけ・bin だけの指定では絞り込まず、新しい順に返す', async () => {
      const { call } = run()
      const plain = await listOf(call, 'scope=passed')
      expect(ids(plain)).toEqual(['6', '5', '4', '3', '1'])
      expect(await listOf(call, 'scope=passed&judge=llm')).toEqual(plain)
      expect(await listOf(call, 'scope=passed&bin=9')).toEqual(plain)
    })

    test('範囲外の bin と未知の judge は 400', async () => {
      const { call } = run()
      expect((await call('/api/posts?judge=llm&bin=10')).status).toBe(400)
      expect((await call('/api/posts?judge=llm&bin=-1')).status).toBe(400)
      expect((await call('/api/posts?judge=llm&bin=1.5')).status).toBe(400)
      expect((await call('/api/posts?judge=foo&bin=1')).status).toBe(400)
    })

    test('PostView は判定のキャッシュにある確率を llm・clef に持ち、無ければキー自体を持たない', async () => {
      const { call } = run()
      const all = await listOf(call, 'scope=all&limit=100')
      const byId = new Map(all.posts.map((entry) => [entry.id, entry]))
      // 候補でないリツイート（2・7）の確率も付く
      expect(byId.get('2')).toMatchObject({ llm: 0.95 })
      expect(byId.get('2')).not.toHaveProperty('clef')
      expect(byId.get('4')).toMatchObject({ llm: 1, clef: 0.99 })
      expect(byId.get('6')).toMatchObject({ llm: 0 })
      // 判定のキャッシュが空なら、どの投稿も llm・clef を持たない
      const { call: bare } = setup()
      const none = await listOf(bare, 'scope=all')
      expect(none.posts.every((entry) => !('llm' in entry) && !('clef' in entry))).toBe(true)
    })
  })

  test('ラベルを保存すると一覧に反映され、削除で戻る', async () => {
    const { call, saved } = setup()
    const put = await call('/api/labels/3', {
      method: 'PUT',
      body: JSON.stringify({ verdict: 'event', type: 'announce' })
    })
    expect(LabelResponseSchema.safeParse(await put.json()).data).toEqual({
      label: { verdict: 'event', type: 'announce', updatedAt: '2026-10-08T01:00:00.000Z' }
    })
    expect(saved).toHaveLength(1)
    const unlabeled = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=unlabeled')).json())
    expect(unlabeled.data?.total).toBe(0)
    await call('/api/labels/3', { method: 'DELETE' })
    expect(saved[1]).toEqual({})
  })

  test('存在しない投稿へのラベルと不正なラベルは拒否する', async () => {
    const { call, saved } = setup()
    expect((await call('/api/labels/999', { method: 'PUT', body: '{"verdict":"event"}' })).status).toBe(404)
    expect((await call('/api/labels/3', { method: 'PUT', body: '{"verdict":"maybe"}' })).status).toBe(400)
    expect(saved).toHaveLength(0)
  })

  test('イベント詳細は参考 URL がアーカイブにあるかと関連投稿を返す', async () => {
    const { call } = setup()
    const parsed = EventDetailResponseSchema.safeParse(await (await call(`/api/events/${EVENT_ID}`)).json())
    expect(parsed.data?.event.referenceUrls).toEqual([
      { type: 'announce', url: 'https://x.com/bic_example/status/1', archived: true }
    ])
    expect(parsed.data?.posts.map((entry) => entry.id)).toEqual(['1', '3'])
  })

  test('キーワードを無効にすると判定をやり直す', async () => {
    const { call } = setup()
    const response = await call('/api/keywords', { method: 'POST', body: JSON.stringify({ disabled: ['アクキー'] }) })
    const parsed = KeywordsResponseSchema.safeParse(await response.json())
    expect(parsed.data?.keywords.find((stat) => stat.keyword === 'アクキー')?.disabled).toBe(true)
    const passed = PostsResponseSchema.safeParse(await (await call('/api/posts?scope=passed')).json())
    expect(passed.data?.posts.map((entry) => entry.id)).toEqual(['1'])
  })

  test('キーワードは GET でも POST でも救済語の寄与を含む同じ形で返す', async () => {
    // 投稿 4 は除外語（体験会）に当たるが、救済語（アクキー）を含むので通過する
    const { call } = setup([post('4', '体験会でアクキーを配布します', { createdAt: '2026-06-03T01:00:00.000Z' })])
    const got = KeywordsResponseSchema.safeParse(await (await call('/api/keywords')).json())
    expect(got.success).toBe(true)
    expect(got.data?.rescues.find((stat) => stat.keyword === 'アクキー')).toEqual({
      keyword: 'アクキー',
      kind: 'keyword',
      posts: 1,
      onlyPosts: 1,
      gold: 0
    })
    expect(got.data?.rescues.find((stat) => stat.keyword === '例たん')).toMatchObject({ kind: 'character', posts: 0 })
    const posted = KeywordsResponseSchema.safeParse(
      await (await call('/api/keywords', { method: 'POST', body: JSON.stringify({ disabled: [] }) })).json()
    )
    expect(posted.data).toEqual(got.data)
    // 除外語を無効にすると、除外語に当たらなくなった投稿は救済した数から外れる
    const withoutExclude = KeywordsResponseSchema.safeParse(
      await (
        await call('/api/keywords', {
          method: 'POST',
          body: JSON.stringify({ disabled: [], disabledExcludes: ['体験会'] })
        })
      ).json()
    )
    expect(withoutExclude.data?.rescues.find((stat) => stat.keyword === 'アクキー')).toMatchObject({ posts: 0 })
  })

  test('charts はスキーマどおりの形で、判定・D1・エミュレート結果を集計して返す', async () => {
    const emulated: EmulatedFile = {
      emulatedAt: '2026-10-09T03:00:00.000Z',
      events: [
        emulatedRecord({
          store: 'example',
          startDate: '2026-06-10',
          endedAt: '2026-07-02',
          firstSeen: Date.parse('2026-06-01T01:00:00.000Z')
        }),
        emulatedRecord({ store: 'example', firstSeen: Date.parse('2026-06-02T01:00:00.000Z') })
      ]
    }
    // 投稿 2 はリツイートで候補でないので、判定があっても数えない。投稿 1 は D1 イベントの参考 URL が指している
    const { call } = setup(
      [],
      {
        llm: new Map([
          ['1', 0.9],
          ['2', 0.9],
          ['3', 0.2]
        ]),
        clef: new Map([['1', 0.5]])
      },
      basePosts(),
      emulated
    )
    const response = await call('/api/charts')
    expect(response.status).toBe(200)
    const parsed = ChartsResponseSchema.safeParse(await response.json())
    expect(parsed.success).toBe(true)
    const counts = (bins: { count: number }[] | undefined) => bins?.map((bin) => bin.count)
    expect(counts(parsed.data?.llmProbability.all)).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 1])
    expect(counts(parsed.data?.llmProbability.gold)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(counts(parsed.data?.clefProbability)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0])
    expect(parsed.data?.monthlyPosts).toEqual([{ month: '2026-06', posts: 3, candidates: 2 }])
    // 2 件目は startDate が無いので firstSeen の月。終了は 7 月で、6 月と 7 月の間に空きは無い
    expect(parsed.data?.monthlyEvents).toEqual([
      { month: '2026-06', llm: 2, llmEnded: 0, d1: 1 },
      { month: '2026-07', llm: 0, llmEnded: 1, d1: 0 }
    ])
    expect(parsed.data?.stores).toEqual([{ store: 'example', count: 2 }])
  })

  test('charts はエミュレート結果が無ければ LLM イベント・LLM 終了・店舗別が 0／空になる', async () => {
    const { call } = setup()
    const parsed = ChartsResponseSchema.safeParse(await (await call('/api/charts')).json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.monthlyEvents).toEqual([{ month: '2026-06', llm: 0, llmEnded: 0, d1: 1 }])
    expect(parsed.data?.stores).toEqual([])
  })

  test('charts は分析が変わる（キーワードの無効化）までは同じ結果を返し、変わったら作り直す', async () => {
    const { call } = setup([], { llm: new Map([['3', 0.2]]), clef: new Map() })
    const candidates = async () => {
      const parsed = ChartsResponseSchema.safeParse(await (await call('/api/charts')).json())
      return parsed.data?.monthlyPosts.map((entry) => entry.candidates)
    }
    expect(await candidates()).toEqual([2])
    expect(await candidates()).toEqual([2])
    // アクキーを無効にすると、投稿 3 は候補から外れる
    await call('/api/keywords', { method: 'POST', body: JSON.stringify({ disabled: ['アクキー'] }) })
    expect(await candidates()).toEqual([1])
  })
})

describe('fetchGoldEvents', () => {
  test('JSON 以外の応答（Worker の 1101 等）は再試行する', async () => {
    const calls: string[] = []
    const responses = new Map<string, Response[]>([
      ['/api/events', [Response.json([{ uuid: EVENT_ID }])]],
      [`/api/events/${EVENT_ID}`, [new Response('error code: 1101', { status: 500 }), Response.json(event)]]
    ])
    const fetchImpl = async (input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      calls.push(path)
      const next = responses.get(path)?.shift()
      if (!next) throw new Error(`unexpected ${path}`)
      return next
    }
    const events = await fetchGoldEvents({
      baseUrl: 'https://example.com',
      retryDelayMs: 0,
      fetchImpl: Object.assign(fetchImpl, { preconnect: () => {} })
    })
    expect(events).toEqual([event])
    expect(calls).toEqual(['/api/events', `/api/events/${EVENT_ID}`, `/api/events/${EVENT_ID}`])
  })
})
