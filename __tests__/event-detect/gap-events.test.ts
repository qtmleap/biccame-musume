import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { analyze } from '../../scripts/lib/event-detect/analysis'
import { createApi } from '../../scripts/lib/event-detect/api'
import type { Verifier } from '../../scripts/lib/event-detect/emulate'
import { type Extraction, extractInput, extractKey } from '../../scripts/lib/event-detect/extract'
import {
  type GapEventsFile,
  gapRows,
  resolveGapEvents,
  writeGapEvents
} from '../../scripts/lib/event-detect/gap-events'
import { GapsResponseSchema } from '../../scripts/lib/event-detect/schema'
import { readGapEvents } from '../../scripts/lib/event-detect/store'

const accounts = [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }]
const storeNames = new Map([['example', ['例たん']]])
const endpoint = { url: 'http://127.0.0.1/unused', token: 't' }

// 強シグナル（景品名＋配布方法＋日付）で、D1 イベントが無い投稿。文面を変えて同文のまとめを避ける
const post = (id: string, createdAt: string, text: string): DetectPost => ({
  id,
  createdAt,
  screenName: 'bic_example',
  kind: 'original',
  text,
  url: `https://x.com/bic_example/status/${id}`,
  media: []
})

const posts = [
  post('1', '2026-11-20T01:00:00.000Z', '12/1からクリスマス名刺を配布します'),
  post('2', '2026-12-01T01:00:00.000Z', '本日12/1からクリスマス名刺を配布中です'),
  post('3', '2026-12-02T01:00:00.000Z', 'クリスマス名刺は12/1から配布しています')
]

const analysisOf = (list: readonly DetectPost[]) =>
  analyze({ posts: list, events: [], accounts, characterNames: ['例たん'] })

const extraction = (
  postId: string,
  status: Extraction['events'][number]['status'],
  isEvent = 0.9,
  item = 'クリスマス名刺'
): Extraction => ({
  key: postId,
  model: 'claude-haiku-5-5',
  version: 'v2',
  postId,
  isEvent,
  events: isEvent < 0.5 ? [] : [{ item, category: 'limited_card', status, stores: [] }],
  attempts: 1,
  usage: { input_tokens: 0, output_tokens: 0 },
  elapsedMs: 0
})

const toolResponse = (input: unknown) =>
  Response.json({
    content: [{ type: 'tool_use', name: 'answer', input }],
    usage: { input_tokens: 10, output_tokens: 2 }
  })

describe('gapRows', () => {
  test('登録漏れ候補の投稿をアカウントごとに古い順に平らにする', () => {
    expect(gapRows(analysisOf([posts[2], posts[0], posts[1]])).map((row) => row.post.id)).toEqual(['1', '2', '3'])
  })
})

describe('resolveGapEvents', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  })

  /** 抽出結果を先に置いて、Haiku の呼び出しを link の分だけに絞る。link の回答は answer で差し替える */
  const run = async (
    list: readonly DetectPost[],
    extractions: Record<string, Extraction>,
    answer: (user: string) => string,
    verify?: { check: Verifier; threshold: number }
  ) => {
    const root = await mkdtemp(join(tmpdir(), 'gap-events-'))
    directories.push(root)
    const analysis = analysisOf(list)
    const extractDir = join(root, 'extract')
    for (const row of analysis.rows) {
      const saved = extractions[row.post.id]
      if (!saved) continue
      const key = extractKey(extractInput(row.post, accounts, storeNames))
      await Bun.write(join(extractDir, `${key}.json`), JSON.stringify(saved))
    }
    const preconnect = globalThis.fetch.preconnect
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (_url: unknown, init?: RequestInit) => {
          const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}')
          const user = typeof body === 'object' && body !== null ? Reflect.get(body, 'messages')?.[0]?.content : ''
          return toolResponse({ choice: answer(String(user)) })
        },
        { preconnect }
      )
    )
    try {
      const result = await resolveGapEvents({
        rows: gapRows(analysis),
        accounts,
        storeNames,
        endpoint,
        extractDir,
        emulateDir: join(root, 'emulate'),
        extractConcurrency: 1,
        emulateConcurrency: 1,
        ...(verify ? { verify } : {})
      })
      return { result, fetch: fetch.mock.calls.length, extractDir }
    } finally {
      fetch.mockRestore()
    }
  }

  test('同じイベントの複数の投稿は 1 つのイベントにまとまり、言及を数えられる', async () => {
    const { result, fetch } = await run(
      posts,
      { '1': extraction('1', 'announce'), '2': extraction('2', 'start'), '3': extraction('3', 'ongoing') },
      () => 'e0'
    )
    // 1 件目は候補が無いので呼ばれない。2・3 件目が既存のイベント e0 を選ぶ
    expect(fetch).toBe(2)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ store: 'example', item: 'クリスマス名刺', status: 'ongoing' })
    expect(result.events[0].posts.map((entry) => entry.postId)).toEqual(['1', '2', '3'])
    expect(result.processed).toEqual(['1', '2', '3'])
    expect(result.ignored).toBe(0)
  })

  test('終了済みのイベントには猶予期間を過ぎると合流せず、新しいイベントになる', async () => {
    const { result, fetch } = await run(
      [
        post('1', '2026-11-20T01:00:00.000Z', '12/1からクリスマス名刺を配布します'),
        post('2', '2026-12-05T01:00:00.000Z', 'クリスマス名刺は配布を終了しました。12/5まででした'),
        post('3', '2027-01-10T01:00:00.000Z', '1/15から新春名刺を配布します')
      ],
      { '1': extraction('1', 'announce'), '2': extraction('2', 'end'), '3': extraction('3', 'announce') },
      () => 'e0'
    )
    // 3 件目は終了から 3 日以上経っているので候補が無く、問い合わせずに新規になる（呼ばれるのは 2 件目だけ）
    expect(fetch).toBe(1)
    expect(result.events).toHaveLength(2)
    expect(result.events[0]).toMatchObject({ status: 'end', endedAt: '2026-12-05' })
    expect(result.events[0].posts.map((entry) => entry.postId)).toEqual(['1', '2'])
    expect(result.events[1].posts.map((entry) => entry.postId)).toEqual(['3'])
  })

  test('isEvent が低い投稿はどのイベントにも入らず、ignored に数える', async () => {
    const { result } = await run(
      posts,
      { '1': extraction('1', 'announce'), '2': extraction('2', 'start', 0.2), '3': extraction('3', 'ongoing') },
      () => 'e0'
    )
    expect(result.events).toHaveLength(1)
    expect(result.events[0].posts.map((entry) => entry.postId)).toEqual(['1', '3'])
    expect(result.processed).toEqual(['1', '2', '3'])
    expect(result.ignored).toBe(1)
  })

  test('Haiku が new を選んでも、再確認が既存のイベントを選べば合流する', async () => {
    const { result } = await run(
      posts.slice(0, 2),
      { '1': extraction('1', 'announce'), '2': extraction('2', 'start') },
      () => 'new',
      {
        check: async () => ({ choice: 'e0', probability: 0.9, probabilities: { e0: 0.9, new: 0.1 }, cached: false }),
        threshold: 0.7
      }
    )
    expect(result.events).toHaveLength(1)
    expect(result.emulate).toMatchObject({ verified: 1, merged: 1 })
  })

  test('照合に失敗した投稿は処理済みに入れず、未集約として残す', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gap-events-'))
    directories.push(root)
    const analysis = analysisOf(posts.slice(0, 2))
    const extractDir = join(root, 'extract')
    for (const [row, saved] of [
      [analysis.rows[0], extraction('1', 'announce')],
      [analysis.rows[1], extraction('2', 'start')]
    ] as const)
      await Bun.write(
        join(extractDir, `${extractKey(extractInput(row.post, accounts, storeNames))}.json`),
        JSON.stringify(saved)
      )
    const preconnect = globalThis.fetch.preconnect
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(async () => Response.json({ error: 'bad request' }, { status: 400 }), { preconnect })
    )
    try {
      const result = await resolveGapEvents({
        rows: gapRows(analysis),
        accounts,
        storeNames,
        endpoint,
        extractDir,
        emulateDir: join(root, 'emulate'),
        extractConcurrency: 1,
        emulateConcurrency: 1
      })
      expect(result.processed).toEqual(['1'])
      expect(result.emulate.failed).toBe(1)
    } finally {
      fetch.mockRestore()
    }
  })

  test('未抽出の投稿は抽出してから照合する', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gap-events-'))
    directories.push(root)
    const analysis = analysisOf(posts.slice(0, 1))
    const preconnect = globalThis.fetch.preconnect
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async () =>
          toolResponse({
            is_event: 0.95,
            events: [
              {
                item: 'クリスマス名刺',
                category: 'limited_card',
                status: 'announce',
                stores: ['example'],
                start_date: '2026-12-01',
                end_date: 'none',
                quantity: 'none'
              }
            ]
          }),
        { preconnect }
      )
    )
    try {
      const result = await resolveGapEvents({
        rows: gapRows(analysis),
        accounts,
        storeNames,
        endpoint,
        extractDir: join(root, 'extract'),
        emulateDir: join(root, 'emulate'),
        extractConcurrency: 1,
        emulateConcurrency: 1
      })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(result.extract).toMatchObject({ total: 1, failed: 0 })
      expect(result.unextracted).toBe(0)
      expect(result.events).toHaveLength(1)
      expect(result.events[0]).toMatchObject({ item: 'クリスマス名刺', startDate: '2026-12-01' })
    } finally {
      fetch.mockRestore()
    }
  })
})

describe('gap-events.json', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
  })

  const file: GapEventsFile = {
    generatedAt: '2026-12-03T00:00:00.000Z',
    verify: { model: 'clef', threshold: 0.7 },
    processed: ['1'],
    events: [
      {
        id: 'example-1',
        store: 'example',
        item: 'クリスマス名刺',
        category: 'limited_card',
        status: 'announce',
        startUnknown: false,
        firstSeen: Date.parse('2026-11-20T01:00:00.000Z'),
        lastSeen: Date.parse('2026-11-20T01:00:00.000Z'),
        posts: [{ postId: '1', status: 'announce', index: 0 }]
      }
    ]
  }

  test('再確認の結果（verify）を持つ言及も同じ形で読み戻し、verify の無い古い形式のファイルも読める', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gap-events-file-'))
    directories.push(dir)
    const path = join(dir, 'gap-events.json')
    const verify = {
      choice: 'example-1',
      probability: 0.6,
      probabilities: { 'example-1': 0.6, new: 0.4 },
      merged: false
    }
    const withVerify: GapEventsFile = {
      ...file,
      events: [{ ...file.events[0], posts: [{ postId: '1', status: 'announce', index: 0, verify }] }]
    }
    await writeGapEvents(path, withVerify)
    expect(await readGapEvents(path)).toEqual(withVerify)
    // verify を持たない言及（この項目を足す前に書かれたファイル）
    await writeFile(path, JSON.stringify(file))
    expect(await readGapEvents(path)).toEqual(file)
  })

  test('verify の形が違うファイルは検証で弾く', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gap-events-file-'))
    directories.push(dir)
    const path = join(dir, 'gap-events.json')
    const broken = { choice: 'example-1', probability: 0.6, merged: false }
    await writeFile(
      path,
      JSON.stringify({
        ...file,
        events: [{ ...file.events[0], posts: [{ postId: '1', status: 'announce', index: 0, verify: broken }] }]
      })
    )
    await expect(readGapEvents(path)).rejects.toThrow('re-run gaps')
  })

  test('書いたファイルを同じ形で読み戻し、無ければ undefined', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gap-events-file-'))
    directories.push(dir)
    const path = join(dir, 'gap-events.json')
    expect(await readGapEvents(path)).toBeUndefined()
    await writeGapEvents(path, file)
    expect(await readGapEvents(path)).toEqual(file)
  })

  test('形の違うファイルは検証で弾く', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gap-events-file-'))
    directories.push(dir)
    const path = join(dir, 'gap-events.json')
    await writeFile(path, JSON.stringify({ ...file, events: [{ ...file.events[0], status: 'unknown' }] }))
    await expect(readGapEvents(path)).rejects.toThrow('re-run gaps')
  })
})

describe('GET /api/gaps', () => {
  const list = [
    ...posts,
    post('4', '2026-12-03T01:00:00.000Z', '12/10から新春名刺を配布します'),
    post('5', '2026-12-04T01:00:00.000Z', '12/5からアクキーを配布します')
  ]

  const setup = (gapEvents: GapEventsFile | undefined) => {
    const api = createApi({
      posts: list,
      events: [],
      accounts,
      characterNames: ['例たん'],
      source: {
        archive: '/tmp/posts.jsonl',
        complete: true,
        pages: 1,
        goldFetchedAt: '2026-12-01T00:00:00.000Z'
      },
      labels: {},
      judgements: { llm: new Map(), clef: new Map() },
      emulated: undefined,
      saveLabels: async () => {},
      readGapEvents: async () => gapEvents,
      now: () => '2026-12-05T00:00:00.000Z'
    })
    return async () => {
      const parsed = GapsResponseSchema.safeParse(
        await api.handle(new Request('http://localhost/api/gaps')).then((r) => r.json())
      )
      if (!parsed.success) throw new Error(parsed.error.message)
      return parsed.data
    }
  }

  test('ファイルが無ければ generatedAt は null で、候補の全件が古い順に pending になる', async () => {
    const response = await setup(undefined)()
    expect(response).toMatchObject({ generatedAt: null, verify: null, events: [], ignored: 0 })
    expect(response.pending.map((entry) => entry.id)).toEqual(['1', '2', '3', '4', '5'])
  })

  test('イベントは言及数と状態別の数を持ち、投稿は古い順に重複を除く', async () => {
    const response = await setup({
      generatedAt: '2026-12-05T00:00:00.000Z',
      verify: { model: 'clef', threshold: 0.7 },
      processed: ['1', '2', '3', '4'],
      events: [
        {
          id: 'example-1',
          store: 'example',
          item: 'クリスマス名刺',
          category: 'limited_card',
          status: 'ongoing',
          startDate: '2026-12-01',
          startUnknown: false,
          firstSeen: Date.parse('2026-11-20T01:00:00.000Z'),
          lastSeen: Date.parse('2026-12-02T01:00:00.000Z'),
          posts: [
            { postId: '2', status: 'start', index: 0 },
            { postId: '1', status: 'announce', index: 0 },
            { postId: '1', status: 'announce', index: 1 },
            { postId: '2', status: 'ongoing', index: 1 },
            // アーカイブに無い投稿の言及は飛ばす
            { postId: '999', status: 'end', index: 0 }
          ]
        },
        {
          id: 'example-2',
          store: 'example',
          item: '消えた名刺',
          category: 'other',
          status: 'announce',
          startUnknown: false,
          firstSeen: Date.parse('2026-12-03T01:00:00.000Z'),
          lastSeen: Date.parse('2026-12-03T01:00:00.000Z'),
          posts: [{ postId: '998', status: 'announce', index: 0 }]
        }
      ]
    })()
    expect(response.generatedAt).toBe('2026-12-05T00:00:00.000Z')
    expect(response.verify).toEqual({ model: 'clef', threshold: 0.7 })
    // 言及が全部消えたイベントは落とす
    expect(response.events).toHaveLength(1)
    const [event] = response.events
    expect(event).toMatchObject({
      id: 'example-1',
      mentions: 2,
      statusCounts: { announce: 1, start: 1, ongoing: 1, end: 0 },
      firstSeen: '2026-11-20T01:00:00.000Z',
      lastSeen: '2026-12-02T01:00:00.000Z'
    })
    // 同じ投稿が複数の状態で載っていれば、一番進んだ状態を 1 件だけ出す
    expect(event.posts.map((entry) => [entry.post.id, entry.status])).toEqual([
      ['1', 'announce'],
      ['2', 'ongoing']
    ])
    // 調べたがどのイベントにも入っていない 3・4 は ignored、調べていない 5 は pending
    expect(response.ignored).toBe(2)
    expect(response.pending.map((entry) => entry.id)).toEqual(['5'])
  })

  test('投稿に再確認の結果を返し、同じ投稿の言及が複数あれば index が最小で再確認をしたものを使う', async () => {
    const verify = (choice: string, probability: number, merged: boolean) => ({
      choice,
      probability,
      probabilities: { [choice]: probability },
      merged
    })
    const response = await setup({
      generatedAt: '2026-12-05T00:00:00.000Z',
      verify: { model: 'clef', threshold: 0.7 },
      processed: ['1', '2', '3'],
      events: [
        {
          id: 'example-1',
          store: 'example',
          item: 'クリスマス名刺',
          category: 'limited_card',
          status: 'ongoing',
          startUnknown: false,
          firstSeen: Date.parse('2026-11-20T01:00:00.000Z'),
          lastSeen: Date.parse('2026-12-02T01:00:00.000Z'),
          posts: [
            // 1: index 0 は再確認なし、index 1・2 にあるうち index が小さい 1 を使う（並びは index 順とは限らない）
            { postId: '1', status: 'announce', index: 0 },
            { postId: '1', status: 'announce', index: 2, verify: verify('new', 0.91, false) },
            { postId: '1', status: 'announce', index: 1, verify: verify('example-1', 0.54, false) },
            // 2: 再確認あり 1 件
            { postId: '2', status: 'start', index: 0, verify: verify('example-1', 0.82, true) },
            // 3: 再確認なし
            { postId: '3', status: 'ongoing', index: 0 }
          ]
        }
      ]
    })()
    const [event] = response.events
    expect(event.posts.map((entry) => [entry.post.id, entry.verify])).toEqual([
      ['1', verify('example-1', 0.54, false)],
      ['2', verify('example-1', 0.82, true)],
      ['3', undefined]
    ])
    // 再確認をしていない投稿はキー自体を持たない
    expect(event.posts[2]).not.toHaveProperty('verify')
  })

  test('verify の無い古い形式のファイルでも、投稿は verify なしで返る', async () => {
    const response = await setup({
      generatedAt: '2026-12-05T00:00:00.000Z',
      verify: null,
      processed: ['1'],
      events: [
        {
          id: 'example-1',
          store: 'example',
          item: 'クリスマス名刺',
          category: 'limited_card',
          status: 'announce',
          startUnknown: false,
          firstSeen: Date.parse('2026-11-20T01:00:00.000Z'),
          lastSeen: Date.parse('2026-11-20T01:00:00.000Z'),
          posts: [{ postId: '1', status: 'announce', index: 0 }]
        }
      ]
    })()
    expect(response.events[0].posts).toHaveLength(1)
    expect(response.events[0].posts[0]).not.toHaveProperty('verify')
  })

  test('イベントは最後の言及が新しい順に並ぶ', async () => {
    const event = (id: string, postId: string, lastSeen: string): GapEventsFile['events'][number] => ({
      id,
      store: 'example',
      item: id,
      category: 'limited_card',
      status: 'announce',
      startUnknown: false,
      firstSeen: Date.parse(lastSeen),
      lastSeen: Date.parse(lastSeen),
      posts: [{ postId, status: 'announce', index: 0 }]
    })
    const response = await setup({
      generatedAt: '2026-12-05T00:00:00.000Z',
      verify: null,
      processed: ['1', '4'],
      events: [event('older', '1', '2026-11-20T01:00:00.000Z'), event('newer', '4', '2026-12-03T01:00:00.000Z')]
    })()
    expect(response.events.map((entry) => entry.id)).toEqual(['newer', 'older'])
    expect(response.pending.map((entry) => entry.id)).toEqual(['2', '3', '5'])
  })
})
