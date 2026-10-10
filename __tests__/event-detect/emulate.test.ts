import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { analyze } from '../../scripts/lib/event-detect/analysis'
import { buildTimelines, type EmulatedEvent, runEmulation, type Verifier } from '../../scripts/lib/event-detect/emulate'
import { scoreEmulation } from '../../scripts/lib/event-detect/emulate-score'
import { type ExtractInput, type Extraction, validateExtraction } from '../../scripts/lib/event-detect/extract'
import type { GoldEvent } from '../../scripts/lib/event-detect/gold'
import { buildVerifyRequest } from '../../scripts/lib/event-detect/verify'

const accounts = [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }]

const post = (id: string, createdAt: string, text = '配布します'): DetectPost => ({
  id,
  createdAt,
  screenName: 'bic_example',
  kind: 'original',
  text,
  url: `https://x.com/bic_example/status/${id}`,
  media: []
})

const extraction = (postId: string, events: Extraction['events'], isEvent = 0.9): Extraction => ({
  key: postId,
  model: 'claude-haiku-5-5',
  version: 'v2',
  postId,
  isEvent,
  events,
  attempts: 1,
  usage: { input_tokens: 0, output_tokens: 0 },
  elapsedMs: 0
})

const card = (status: Extraction['events'][number]['status'], extra: Partial<Extraction['events'][number]> = {}) => ({
  item: 'ハロウィン名刺',
  category: 'limited_card' as const,
  status,
  stores: [],
  ...extra
})

describe('validateExtraction', () => {
  const input: ExtractInput = { state: 's', stores: ['example', 'other'], dates: ['2026-10-01'], quantities: [100] }

  test('候補から選んだ値を受け付け、none は値なしにする', () => {
    expect(
      validateExtraction(input, {
        is_event: 0.9,
        events: [
          {
            item: ' 名刺 ',
            category: 'limited_card',
            status: 'announce',
            stores: ['example', 'none'],
            start_date: '2026-10-01',
            end_date: 'none',
            quantity: '100'
          }
        ]
      })
    ).toEqual({
      isEvent: 0.9,
      events: [
        {
          item: '名刺',
          category: 'limited_card',
          status: 'announce',
          stores: ['example'],
          startDate: '2026-10-01',
          quantity: 100
        }
      ]
    })
  })

  test('候補に無い日付・店舗・数量や不正な状態は理由を返す', () => {
    const base = {
      item: '名刺',
      category: 'ackey',
      status: 'start',
      stores: [],
      start_date: 'none',
      end_date: 'none',
      quantity: 'none'
    }
    expect(validateExtraction(input, { is_event: 1, events: [{ ...base, start_date: '2026-12-25' }] })).toContain(
      'bad start_date'
    )
    expect(validateExtraction(input, { is_event: 1, events: [{ ...base, stores: ['nowhere'] }] })).toContain(
      'bad stores'
    )
    expect(validateExtraction(input, { is_event: 1, events: [{ ...base, quantity: '50' }] })).toContain('bad quantity')
    expect(validateExtraction(input, { is_event: 1, events: [{ ...base, status: 'none' }] })).toContain('bad status')
    expect(validateExtraction(input, { is_event: 2, events: [] })).toContain('bad is_event')
  })
})

describe('buildTimelines', () => {
  test('店舗ごとに古い順に並べ、店舗の無いイベントは投稿者の店舗に入れる', () => {
    const rows = analyze({
      posts: [post('2', '2026-06-02T01:00:00.000Z'), post('1', '2026-06-01T01:00:00.000Z')],
      events: [],
      accounts,
      characterNames: ['例たん']
    }).rows
    const timelines = buildTimelines(
      [
        { row: rows[0], extraction: extraction('2', [card('start', { stores: ['example', 'other'] })]), state: 's2' },
        { row: rows[1], extraction: extraction('1', [card('announce')]), state: 's1' },
        { row: rows[1], extraction: extraction('1', [card('announce')], 0.2), state: 'low' }
      ],
      accounts
    )
    expect(timelines.get('example')?.map((mention) => mention.row.post.id)).toEqual(['1', '2'])
    expect(timelines.get('other')?.map((mention) => mention.row.post.id)).toEqual(['2'])
  })
})

describe('runEmulation', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  })

  test('候補が無ければ作り、選ばれたイベントには状態と終了日を反映する', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'emulate-'))
    directories.push(cacheDir)
    const rows = analyze({
      posts: [
        post('1', '2026-09-20T01:00:00.000Z', '10/1からハロウィン名刺'),
        post('2', '2026-10-01T01:00:00.000Z', '本日からハロウィン名刺'),
        post('3', '2026-10-20T01:00:00.000Z', 'ハロウィン名刺は配布終了')
      ],
      events: [],
      accounts,
      characterNames: ['例たん']
    }).rows
    const timelines = buildTimelines(
      [
        { row: rows[0], extraction: extraction('1', [card('announce', { startDate: '2026-10-01' })]), state: 's1' },
        { row: rows[1], extraction: extraction('2', [card('start')]), state: 's2' },
        { row: rows[2], extraction: extraction('3', [card('end')]), state: 's3' }
      ],
      accounts
    )
    // 1 件目は候補が無いので呼ばれない。2・3 件目は既存の e0 を選ぶ
    const preconnect = globalThis.fetch.preconnect
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async () =>
          Response.json({
            content: [{ type: 'tool_use', name: 'answer', input: { choice: 'e0' } }],
            usage: { input_tokens: 10, output_tokens: 2 }
          }),
        { preconnect }
      )
    )
    try {
      const { events, progress } = await runEmulation({
        timelines,
        endpoint: { url: 'http://127.0.0.1/unused', token: 't' },
        cacheDir,
        concurrency: 1
      })
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(progress).toMatchObject({ created: 1, linked: 2, calls: 2, cachedCalls: 0 })
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        store: 'example',
        status: 'end',
        startDate: '2026-10-01',
        endedAt: '2026-10-20',
        startUnknown: false
      })
      expect(events[0].posts.map((p) => p.postId)).toEqual(['1', '2', '3'])
      // 再確認を行わない実行では verify を付けない
      expect(events[0].posts.filter((p) => 'verify' in p)).toEqual([])
      // 2 回目は保存した判断を使い、API を呼ばない
      fetch.mockImplementation(
        Object.assign(
          async (): Promise<Response> => {
            throw new Error('cached decisions must be reused')
          },
          { preconnect }
        )
      )
      const again = await runEmulation({
        timelines,
        endpoint: { url: 'http://127.0.0.1/unused', token: 't' },
        cacheDir,
        concurrency: 1
      })
      expect(again.progress.cachedCalls).toBe(2)
      expect(again.events).toEqual(events)
    } finally {
      fetch.mockRestore()
    }
  })
})

describe('Clef による再確認', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  })

  const run = async (verify: Verifier, threshold: number) => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'emulate-verify-'))
    directories.push(cacheDir)
    const rows = analyze({
      posts: [
        post('1', '2026-10-01T01:00:00.000Z', '本日からハロウィン名刺'),
        post('2', '2026-10-05T01:00:00.000Z', 'ハロウィン名刺 配布中です')
      ],
      events: [],
      accounts,
      characterNames: ['例たん']
    }).rows
    const timelines = buildTimelines(
      [
        { row: rows[0], extraction: extraction('1', [card('start')]), state: 's1' },
        { row: rows[1], extraction: extraction('2', [card('ongoing')]), state: 's2' }
      ],
      accounts
    )
    // Haiku は 2 件目を「新規」と判断する（候補は 1 件目から作られた e0）
    const preconnect = globalThis.fetch.preconnect
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async () =>
          Response.json({
            content: [{ type: 'tool_use', name: 'answer', input: { choice: 'new' } }],
            usage: { input_tokens: 1, output_tokens: 1 }
          }),
        { preconnect }
      )
    )
    try {
      return await runEmulation({
        timelines,
        endpoint: { url: 'http://127.0.0.1/unused', token: 't' },
        cacheDir,
        concurrency: 1,
        verify: { check: verify, threshold }
      })
    } finally {
      fetch.mockRestore()
    }
  }

  type Verified = Awaited<ReturnType<Verifier>>

  /** 1 件目のイベント（example-1）を e0 として、選んだ選択肢とその確率を返す Verifier のスタブ */
  const answer =
    (choice: string, probability: number, probabilities: Record<string, number>): Verifier =>
    async () => ({ choice, probability, probabilities, cached: false })

  test('既存のイベントを確率がしきい値以上で選んだら合流させる', async () => {
    const { events, progress } = await run(answer('e0', 0.8, { e0: 0.8, new: 0.2 }), 0.7)
    expect(events).toHaveLength(1)
    expect(events[0].posts.map((entry) => entry.postId)).toEqual(['1', '2'])
    expect(progress).toMatchObject({ verified: 1, merged: 1, created: 1, verifyFailed: 0 })
  })

  test('合流した言及には、イベント ID をキーにした確率と merged: true を残す', async () => {
    const { events } = await run(answer('e0', 0.8, { e0: 0.8, new: 0.2 }), 0.7)
    const [first, second] = events[0].posts
    // 候補が無かった 1 件目は再確認の対象外
    expect(first).not.toHaveProperty('verify')
    expect(second.verify).toEqual({
      choice: 'example-1',
      probability: 0.8,
      probabilities: { 'example-1': 0.8, new: 0.2 },
      merged: true
    })
  })

  test('しきい値に届かず合流しなかった言及が作った新規イベントの最初の言及に、merged: false を残す', async () => {
    const { events } = await run(answer('e0', 0.6, { e0: 0.6, new: 0.4 }), 0.7)
    expect(events).toHaveLength(2)
    expect(events[0].posts[0]).not.toHaveProperty('verify')
    expect(events[1].posts).toEqual([
      {
        postId: '2',
        status: 'ongoing',
        index: 0,
        verify: { choice: 'example-1', probability: 0.6, probabilities: { 'example-1': 0.6, new: 0.4 }, merged: false }
      }
    ])
  })

  test('new と答えた場合も確率を残す', async () => {
    const { events } = await run(answer('new', 0.99, { e0: 0.01, new: 0.99 }), 0.7)
    expect(events).toHaveLength(2)
    expect(events[1].posts[0].verify).toEqual({
      choice: 'new',
      probability: 0.99,
      probabilities: { 'example-1': 0.01, new: 0.99 },
      merged: false
    })
  })

  test('確認に失敗した言及には verify を付けない', async () => {
    const failed = await run(async () => {
      throw new Error('Clef is down')
    }, 0.7)
    expect(failed.events).toHaveLength(2)
    expect(failed.events.flatMap((event) => event.posts).filter((entry) => 'verify' in entry)).toEqual([])
    expect(failed.progress).toMatchObject({ verified: 1, verifyFailed: 1 })
  })

  test('確率がしきい値に届かない・new を選んだ・確認に失敗した場合は新規のまま', async () => {
    const verifiers: Verifier[] = [
      answer('e0', 0.6, { e0: 0.6, new: 0.4 }),
      answer('new', 0.99, { e0: 0.01, new: 0.99 }),
      async (): Promise<Verified> => {
        throw new Error('Clef is down')
      }
    ]
    for (const verify of verifiers) {
      const { events, progress } = await run(verify, 0.7)
      expect(events).toHaveLength(2)
      expect(progress.merged).toBe(0)
    }
  })

  test('確認用のリクエストは候補ごとの選択肢と new を持つ', () => {
    const rows = analyze({
      posts: [post('1', '2026-10-01T01:00:00.000Z')],
      events: [],
      accounts,
      characterNames: []
    }).rows
    const mention = { store: 'example', row: rows[0], index: 0, event: card('start'), state: 'state' }
    const candidate = {
      id: 'example-1',
      store: 'example',
      item: 'ハロウィン名刺',
      category: 'limited_card' as const,
      status: 'start' as const,
      startUnknown: false,
      firstSeen: 0,
      lastSeen: 0,
      posts: []
    }
    const request = buildVerifyRequest(mention, [candidate])
    expect(ClefRequestSchema.safeParse({ model: 'clef', ...request }).success).toBe(true)
    const question = request.questions.same
    expect(question.type === 'choice' ? Object.keys(question.criteria) : []).toEqual(['e0', 'new'])
  })
})

describe('scoreEmulation', () => {
  const gold = (overrides: Partial<GoldEvent>): GoldEvent => ({
    uuid: '00000000-0000-4000-8000-000000000001',
    title: 'ハロウィン名刺',
    category: 'limited_card',
    stores: ['example'],
    startDate: '2026-09-30T15:00:00.000Z',
    endedAt: '2026-10-19T15:00:00.000Z',
    conditions: [],
    isPreliminary: false,
    referenceUrls: [{ type: 'announce', url: 'https://x.com/bic_example/status/1' }],
    ...overrides
  })
  const emulated = (overrides: Partial<EmulatedEvent>): EmulatedEvent => ({
    id: 'example-1',
    store: 'example',
    item: 'ハロウィン名刺',
    category: 'limited_card',
    status: 'end',
    startDate: '2026-10-01',
    endedAt: '2026-10-20',
    startUnknown: false,
    firstSeen: Date.parse('2026-09-20T01:00:00.000Z'),
    lastSeen: Date.parse('2026-10-20T01:00:00.000Z'),
    posts: [{ postId: '1', status: 'announce', index: 0 }],
    ...overrides
  })

  test('開始日が近い同じ店舗のイベントを 1 対 1 で割り当て、余りを作りすぎと D1 に無いものに分ける', () => {
    const analysis = analyze({
      posts: [post('1', '2026-09-20T01:00:00.000Z')],
      events: [gold({})],
      accounts,
      characterNames: ['例たん']
    })
    const score = scoreEmulation({
      events: [
        emulated({}),
        emulated({ id: 'example-2', startDate: '2026-10-02', posts: [] }),
        emulated({ id: 'example-3', startDate: '2026-12-01', firstSeen: Date.parse('2026-11-25T01:00:00.000Z') })
      ],
      gold: [gold({})],
      analysis,
      from: Date.parse('2026-01-01T00:00:00+09:00'),
      until: Date.parse('2027-01-01T00:00:00+09:00'),
      stores: new Set(['example'])
    })
    expect(score).toMatchObject({
      gold: 1,
      emulated: 3,
      matched: 1,
      duplicates: 1,
      extra: 1,
      categoryAgree: 1,
      startExact: 1,
      startKnown: 1,
      ended: { gold: 1, detected: 1, within3Days: 1 },
      postLinks: { total: 1, inMatchedEvent: 1 }
    })
  })
})
