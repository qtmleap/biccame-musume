import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DetectPostKind } from '@biccame/shared/event-detect/post'
import { QUESTION_VERSION } from '../../scripts/lib/event-detect/decide'
import {
  APP_UNSUPPORTED_STORES,
  applySeed,
  describeSeed,
  estimateEnded,
  MAX_LIMITED_QUANTITY,
  MIN_LIMITED_QUANTITY,
  readStoreMarks,
  replyMentions,
  runSeed,
  type SeedEvent,
  type SeedRunOptions,
  STALE_ENDED_DAYS,
  selectSeedEvents,
  usableQuantity
} from '../../scripts/lib/event-detect/seed'
import { makeLocalDb } from '../fixtures/local-d1'

// seed の新しい規則: 最初の告知・開始がリプライのイベントは作らない / ビッカメ娘の店舗だけ / 配布数の上限 / 終了の情報が無いイベントの終了日の推定

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-seed-rules-'))
  directories.push(path)
  return path
}

/** JST の 2026-10-10 12:00 */
const NOW = '2026-10-10T03:00:00.000Z'

/**
 * 最後の言及の既定（NOW の 9〜10 日前）。終了の情報が無いイベントは、最後の言及が開始日より前だと「終了が分からないまま止まっている」と
 * 見なされて作られないので、フィクスチャは最近まで言及されている（fresh）ことにする。
 */
const RECENT = Date.parse('2026-09-30T00:00:00.000Z')

const seedEvent = (init: Partial<SeedEvent> & { id: string }): SeedEvent => ({
  store: 'kashiwa',
  item: '夏名刺',
  category: 'limited_card',
  startDate: '2026-07-01',
  firstSeen: 1,
  lastSeen: RECENT,
  posts: [{ postId: `${init.id}-1`, status: 'announce' }],
  ...init
})

/** 投稿 ID → 種類。ここに無い投稿は posts.jsonl に無いものとして扱う */
const lookups = (kinds: Record<string, DetectPostKind>) => ({
  lookupScreenNames: async (ids: ReadonlySet<string>) =>
    new Map([...ids].filter((id) => id in kinds).map((id) => [id, 'bic_kashiwa'] as const)),
  lookupKinds: async (ids: ReadonlySet<string>) =>
    new Map([...ids].flatMap((id) => (id in kinds ? [[id, kinds[id]] as const] : [])))
})

const options = (events: readonly SeedEvent[], kinds: Record<string, DetectPostKind>) => ({
  events,
  clef: new Map(events.map((event) => [event.posts[0].postId, 0.9] as const)),
  threshold: 0.7,
  gold: [],
  storeKeys: new Set(['kashiwa']),
  names: [],
  ...lookups(kinds),
  now: NOW
})

const stageOf = (selection: Awaited<ReturnType<typeof selectSeedEvents>>, label: string) => {
  const stage = selection.stages.find((entry) => entry.label.includes(label))
  if (!stage) throw new Error(`no stage: ${label}`)
  return stage
}

const url = (id: string) => `https://x.com/bic_kashiwa/status/${id}`

describe('参考 URL: 最初の告知・開始の言及がリプライのイベントは作らない', () => {
  test('最初の告知がリプライ → 計画から外れる。リプライを飛ばして次の投稿を選ぶことはしない', async () => {
    const event = seedEvent({
      id: 'e',
      posts: [
        { postId: '101', status: 'announce' },
        { postId: '102', status: 'announce' }
      ]
    })
    // 2 番目の告知が original でも、最初の告知がリプライなら作らない
    const selection = await selectSeedEvents(options([event], { '101': 'reply', '102': 'original' }))
    expect(selection.plans).toEqual([])
    expect(selection.replyFirst).toEqual({ announce: 1, start: 0, both: 0 })
  })

  test('最初の開始がリプライ → 計画から外れる。告知が original でも作らない', async () => {
    const event = seedEvent({
      id: 'e',
      posts: [
        { postId: '201', status: 'announce' },
        { postId: '202', status: 'start' }
      ]
    })
    const selection = await selectSeedEvents(options([event], { '201': 'original', '202': 'reply' }))
    expect(selection.plans).toEqual([])
    expect(selection.replyFirst).toEqual({ announce: 0, start: 1, both: 0 })
  })

  test('告知も開始もリプライなら both に数える', async () => {
    const event = seedEvent({
      id: 'e',
      posts: [
        { postId: '301', status: 'announce' },
        { postId: '302', status: 'start' }
      ]
    })
    const selection = await selectSeedEvents(options([event], { '301': 'reply', '302': 'reply' }))
    expect(selection.plans).toEqual([])
    expect(selection.replyFirst).toEqual({ announce: 0, start: 0, both: 1 })
  })

  test('quote・original は可。終了のリプライも可（終了だけのイベントも作る）。最初の言及だけを参考 URL にする', async () => {
    const events = [
      seedEvent({
        id: 'ok',
        startDate: '2026-07-01',
        posts: [
          { postId: '401', status: 'announce' },
          { postId: '402', status: 'announce' },
          { postId: '403', status: 'start' },
          { postId: '404', status: 'end' }
        ]
      }),
      seedEvent({ id: 'end-reply', startDate: '2026-07-02', posts: [{ postId: '405', status: 'end' }] })
    ]
    const selection = await selectSeedEvents(
      options(events, { '401': 'quote', '402': 'reply', '403': 'original', '404': 'reply', '405': 'reply' })
    )
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan]))
    // 2 番目の告知（reply）は参考 URL にも判定にも使わない
    expect(byId.get('ok')?.references).toEqual([
      { type: 'announce', url: url('401'), kind: 'quote' },
      { type: 'start', url: url('403'), kind: 'original' },
      { type: 'end', url: url('404'), kind: 'reply' }
    ])
    expect(byId.get('end-reply')?.references).toEqual([{ type: 'end', url: url('405'), kind: 'reply' }])
    expect(selection.replyFirst).toEqual({ announce: 0, start: 0, both: 0 })
  })

  test('告知・開始の言及が無い（ongoing と終了だけ）イベントは今までどおり。終了も無ければ参考 URL が作れず対象外', async () => {
    const events = [
      seedEvent({
        id: 'ongoing-end',
        startDate: '2026-07-01',
        posts: [
          { postId: '501', status: 'ongoing' },
          { postId: '502', status: 'end' }
        ]
      }),
      seedEvent({ id: 'only-ongoing', startDate: '2026-07-02', posts: [{ postId: '503', status: 'ongoing' }] })
    ]
    const selection = await selectSeedEvents(options(events, { '501': 'reply', '502': 'original', '503': 'original' }))
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['ongoing-end'])
    expect(stageOf(selection, '参考 URL を 1 件以上作れる')).toEqual({
      label: expect.any(String),
      excluded: 1,
      remaining: 1
    })
  })

  test('リプライ除外は選別の段階表に 1 行ある（参考 URL を作れるかの前）', async () => {
    const events = [
      seedEvent({ id: 'reply', startDate: '2026-07-01', posts: [{ postId: '601', status: 'announce' }] }),
      seedEvent({ id: 'ok', startDate: '2026-07-02', posts: [{ postId: '602', status: 'announce' }] })
    ]
    const selection = await selectSeedEvents(options(events, { '601': 'reply', '602': 'original' }))
    const labels = selection.stages.map((stage) => stage.label)
    const replyStage = labels.findIndex((label) => label.includes('リプライ'))
    expect(replyStage).toBeGreaterThan(0)
    expect(labels[replyStage + 1]).toContain('参考 URL を 1 件以上作れる')
    expect(selection.stages[replyStage]).toEqual({ label: expect.any(String), excluded: 1, remaining: 1 })
  })

  test('リツイートも来ても使わない（リプライと同じ扱い）', async () => {
    const event = seedEvent({ id: 'e', posts: [{ postId: '701', status: 'announce' }] })
    const selection = await selectSeedEvents(options([event], { '701': 'retweet' }))
    expect(selection.plans).toEqual([])
    expect(selection.replyFirst.announce).toBe(1)
  })

  test('posts.jsonl に無い投稿は kind が分からないのでリプライとは数えない。その種別の参考 URL は作れず、missingPosts に数える', async () => {
    const event = seedEvent({
      id: 'e',
      posts: [
        { postId: '801', status: 'announce' },
        { postId: '802', status: 'end' }
      ]
    })
    const selection = await selectSeedEvents(options([event], { '802': 'original' }))
    expect(selection.plans[0].references).toEqual([{ type: 'end', url: url('802'), kind: 'original' }])
    expect(selection.missingPosts).toBe(1)
    expect(selection.replyFirst).toEqual({ announce: 0, start: 0, both: 0 })
  })

  test('replyMentions: 最初の言及だけを見る。終了は見ない', () => {
    const event = seedEvent({
      id: 'e',
      posts: [
        { postId: '901', status: 'announce' },
        { postId: '902', status: 'announce' },
        { postId: '903', status: 'start' },
        { postId: '904', status: 'end' }
      ]
    })
    const info = (kind: 'reply' | 'original') => ({ screenName: 'a', kind })
    const posts = new Map([
      ['901', info('original')],
      ['902', info('reply')],
      ['903', info('reply')],
      ['904', info('reply')]
    ])
    expect(replyMentions(event, posts)).toEqual(['start'])
  })
})

describe('店舗: ビッカメ娘の店舗だけ（characters.json の is_biccame_musume）', () => {
  const events = [
    seedEvent({ id: 'ok', store: 'kashiwa', startDate: '2026-07-01' }),
    seedEvent({ id: 'camera', store: 'biccamera', startDate: '2026-07-02' }),
    seedEvent({ id: 'sim', store: 'bicsim', startDate: '2026-07-03' }),
    seedEvent({ id: 'air', store: 'air', startDate: '2026-07-04' }),
    seedEvent({ id: 'ghost', store: 'atlantis', startDate: '2026-07-05' })
  ]
  const kinds = Object.fromEntries(events.map((event) => [`${event.id}-1`, 'original' as const]))
  const base = { ...options(events, kinds), storeKeys: new Set(['kashiwa', 'biccamera', 'bicsim', 'air']) }

  test('ビッカメ娘ではない店舗は計画から外れ、段階表は「店舗キーが characters.json にある」の直後に 1 行、店舗別の件数が残る', async () => {
    const selection = await selectSeedEvents({ ...base, nonBiccameStores: new Set(['biccamera', 'bicsim', 'air']) })
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['ok'])
    const labels = selection.stages.map((stage) => stage.label)
    const index = labels.findIndex((label) => label.includes('ビッカメ娘の店舗である'))
    expect(labels[index - 1]).toContain('店舗キーが characters.json にある')
    // characters.json に無い atlantis が 1 件、ビッカメ娘ではない 3 件（air を含む）
    expect(selection.stages[index - 1]).toEqual({ label: expect.any(String), excluded: 1, remaining: 4 })
    expect(selection.stages[index]).toEqual({ label: expect.any(String), excluded: 3, remaining: 1 })
    expect(selection.notBiccameMusume).toEqual({
      count: 3,
      byStore: [
        { store: 'air', count: 1 },
        { store: 'biccamera', count: 1 },
        { store: 'bicsim', count: 1 }
      ]
    })
  })

  test('air は新しい段階で先に落ちるので、アプリの StoreKeySchema の段階の除外は 0 になる', async () => {
    const selection = await selectSeedEvents({
      ...base,
      nonBiccameStores: new Set(['biccamera', 'bicsim', 'air']),
      unsupportedStores: new Set(APP_UNSUPPORTED_STORES)
    })
    expect(stageOf(selection, 'StoreKeySchema').excluded).toBe(0)
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['ok'])
  })

  test('nonBiccameStores を渡さなければ絞り込まない（段階の除外は 0）', async () => {
    const selection = await selectSeedEvents(base)
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual(['air', 'camera', 'ok', 'sim'])
    expect(stageOf(selection, 'ビッカメ娘の店舗である').excluded).toBe(0)
    expect(selection.notBiccameMusume).toEqual({ count: 0, byStore: [] })
  })

  test('readStoreMarks: 本物の characters.json の印から作る（店舗キーの直書きではない）', async () => {
    const path = join(import.meta.dir, '../../workers/app/public/characters.json')
    const marks = await readStoreMarks(path)
    const raw = JSON.parse(await readFile(path, 'utf8'))
    const falseIds = raw
      .filter((entry: { character: { is_biccame_musume: boolean } }) => entry.character.is_biccame_musume === false)
      .map((entry: { id: string }) => entry.id)
    expect([...marks.nonBiccameStores].sort()).toEqual([...falseIds].sort())
    expect(marks.nonBiccameStores.size).toBeGreaterThan(0)
    expect(marks.nonBiccameStores.has('biccamera')).toBe(true)
    expect(marks.nonBiccameStores.has('kashiwa')).toBe(false)
    // ビッカメ娘ではない店舗も店舗キーには入る
    for (const id of marks.nonBiccameStores) expect(marks.storeKeys.has(id)).toBe(true)
    // アプリの StoreKeySchema に無い air も、印から除かれる
    for (const id of APP_UNSUPPORTED_STORES) expect(marks.nonBiccameStores.has(id)).toBe(true)
  })

  test('readStoreMarks: is_biccame_musume が無い要素があればエラー', async () => {
    const root = await tempDir()
    const path = join(root, 'characters.json')
    await writeFile(path, JSON.stringify([{ id: 'kashiwa', character: { name: '柏たん' } }]))
    await expect(readStoreMarks(path)).rejects.toThrow('is_biccame_musume')
    await writeFile(path, JSON.stringify([{ id: 'kashiwa', character: { name: '柏たん', is_biccame_musume: 'yes' } }]))
    await expect(readStoreMarks(path)).rejects.toThrow('is_biccame_musume')
  })
})

describe('配布数の上限（MAX_LIMITED_QUANTITY）', () => {
  test('上限は 1000。1000 ちょうどは使い、1001 は捨てる（下限 10 も両端を含む）', () => {
    expect(MAX_LIMITED_QUANTITY).toBe(1000)
    expect([MIN_LIMITED_QUANTITY - 1, MIN_LIMITED_QUANTITY, 1000, 1001].map(usableQuantity)).toEqual([
      false,
      true,
      true,
      false
    ])
  })

  test('1000 は使い、1001 は limited_quantity を null にして集計に残す。配布条件は everyone', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    const events = [
      seedEvent({ id: 'low', quantity: 9, startDate: '2026-07-01' }),
      seedEvent({ id: 'min', quantity: 10, startDate: '2026-07-02' }),
      seedEvent({ id: 'max', quantity: 1000, startDate: '2026-07-03' }),
      seedEvent({ id: 'over', quantity: 1001, startDate: '2026-07-04' }),
      seedEvent({ id: 'huge', quantity: 7000, startDate: '2026-07-05' })
    ]
    const selection = await selectSeedEvents(
      options(events, {
        'low-1': 'original',
        'min-1': 'original',
        'max-1': 'original',
        'over-1': 'original',
        'huge-1': 'original'
      })
    )
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan.limitedQuantity]))
    expect([...byId]).toEqual(
      expect.arrayContaining([
        ['low', null],
        ['min', 10],
        ['max', 1000],
        ['over', null],
        ['huge', null]
      ])
    )
    expect(selection.oversizedQuantities.count).toBe(2)
    expect(selection.oversizedQuantities.byQuantity).toEqual([
      { quantity: 1001, count: 1 },
      { quantity: 7000, count: 1 }
    ])
    expect(selection.discardedQuantities.count).toBe(1)

    applySeed(db, selection.plans, { now: NOW, force: true })
    const rows = db
      .query<{ start_date: string; limited_quantity: number | null; type: string; quantity: number | null }, []>(
        'SELECT e.start_date, e.limited_quantity, c.type, c.quantity FROM events e JOIN event_conditions c ON c.event_id = e.id ORDER BY e.start_date'
      )
      .all()
    expect(rows.map((row) => [row.limited_quantity, row.type, row.quantity])).toEqual([
      [null, 'everyone', null], // 9
      [10, 'first_come', 10], // 10
      [1000, 'first_come', 1000], // 1000
      [null, 'everyone', null], // 1001
      [null, 'everyone', null] // 7000
    ])
    db.close()
  })
})

describe('終了日の推定（STALE_ENDED_DAYS）', () => {
  // 今日（JST）は 2026-10-10。最後の言及の JST の日付 + 30 日 = 今日 → ちょうど 30 日
  test('最後の言及からちょうど 30 日は推定する。29 日は null のまま（JST の日付で数える）', () => {
    expect(STALE_ENDED_DAYS).toBe(30)
    // JST の 2026-09-10 23:59:59 → 30 日前
    expect(estimateEnded(Date.parse('2026-09-10T14:59:59.000Z'), '2026-07-01', '2026-10-10')).toEqual({
      kind: 'estimated',
      day: '2026-09-10'
    })
    // 1 秒後は JST の 2026-09-11 0 時 → 29 日前
    expect(estimateEnded(Date.parse('2026-09-10T15:00:00.000Z'), '2026-07-01', '2026-10-10')).toEqual({
      kind: 'fresh'
    })
  })

  test('最後の言及の日が開始日より前なら入れない。開始日と同じ日なら入れる', () => {
    expect(estimateEnded(Date.parse('2026-06-30T14:59:59.000Z'), '2026-07-01', '2026-10-10')).toEqual({
      kind: 'before_start'
    })
    expect(estimateEnded(Date.parse('2026-06-30T15:00:00.000Z'), '2026-07-01', '2026-10-10')).toEqual({
      kind: 'estimated',
      day: '2026-07-01'
    })
  })

  test('表せない時刻は入れない', () => {
    expect(estimateEnded(Number.NaN, '2026-07-01', '2026-10-10')).toEqual({ kind: 'before_start' })
  })

  test('作成の計画: 終了の情報が無いイベントだけに、最後の言及の JST 0 時（前日 15:00Z）を endedAt として入れる', async () => {
    const at = (iso: string) => Date.parse(iso)
    const events = [
      seedEvent({ id: 'stale', startDate: '2026-07-01', lastSeen: at('2026-09-10T14:59:59.000Z') }),
      seedEvent({ id: 'recent', startDate: '2026-07-02', lastSeen: at('2026-09-10T15:00:00.000Z') }),
      // 開始が 30 日未満前（今も配布中かもしれない）なので、最後の言及が開始日より前でも作る
      seedEvent({ id: 'early', startDate: '2026-09-25', lastSeen: at('2026-06-01T00:00:00.000Z') }),
      seedEvent({
        id: 'ended',
        startDate: '2026-07-04',
        endedAt: '2026-07-20',
        lastSeen: at('2026-08-01T00:00:00.000Z')
      }),
      seedEvent({
        id: 'planned',
        startDate: '2026-07-05',
        endDate: '2026-07-31',
        lastSeen: at('2026-08-01T00:00:00.000Z')
      })
    ]
    const kinds = Object.fromEntries(events.map((event) => [`${event.id}-1`, 'original' as const]))
    const selection = await selectSeedEvents(options(events, kinds))
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan]))
    expect(byId.get('stale')).toMatchObject({
      endedAt: '2026-09-09T15:00:00.000Z',
      endedDay: '2026-09-10',
      endedAtEstimated: true,
      endDate: null
    })
    expect(byId.get('recent')).toMatchObject({ endedAt: null, endedAtEstimated: false })
    // 最後の言及が開始日より前
    expect(byId.get('early')).toMatchObject({ endedAt: null, endedAtEstimated: false })
    // 実際の終了日がある・終了予定日があるイベントは推定しない
    expect(byId.get('ended')).toMatchObject({ endedAt: '2026-07-19T15:00:00.000Z', endedAtEstimated: false })
    expect(byId.get('planned')).toMatchObject({ endedAt: null, endedAtEstimated: false })
    expect(selection.estimatedEnded).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------
// 実行（posts.jsonl の kind を読み、レポートに残す）
// ---------------------------------------------------------------------------------------------

const makeMaterials = async (root: string) => {
  const dir = join(root, '.cache', 'event-detect')
  await mkdir(join(dir, 'clef', QUESTION_VERSION), { recursive: true })
  const emulated = [
    {
      id: 'kashiwa-1',
      store: 'kashiwa',
      item: '夏名刺',
      category: 'limited_card',
      status: 'end',
      startDate: '2026-07-01',
      startUnknown: false,
      firstSeen: Date.parse('2026-06-28T00:00:00.000Z'),
      lastSeen: Date.parse('2026-08-01T00:00:00.000Z'),
      posts: [
        { postId: '1001', status: 'announce', index: 0 },
        { postId: '1002', status: 'start', index: 0 },
        { postId: '1003', status: 'end', index: 0 }
      ]
    },
    {
      id: 'kashiwa-2',
      store: 'kashiwa',
      item: '秋名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-09-01',
      startUnknown: false,
      firstSeen: Date.parse('2026-08-28T00:00:00.000Z'),
      lastSeen: Date.parse('2026-08-28T00:00:00.000Z'),
      posts: [{ postId: '2001', status: 'announce', index: 0 }]
    },
    // ビックカメラ（ビッカメ娘ではない店舗）。告知は original で、参考 URL も作れる
    {
      id: 'biccamera-1',
      store: 'biccamera',
      item: 'ビックカメラ名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-05-01',
      startUnknown: false,
      firstSeen: Date.parse('2026-04-28T00:00:00.000Z'),
      lastSeen: Date.parse('2026-05-02T00:00:00.000Z'),
      posts: [{ postId: '4001', status: 'announce', index: 0 }]
    },
    {
      id: 'kashiwa-3',
      store: 'kashiwa',
      item: '冬名刺',
      category: 'limited_card',
      status: 'start',
      startDate: '2026-06-01',
      startUnknown: false,
      firstSeen: Date.parse('2026-05-28T00:00:00.000Z'),
      lastSeen: Date.parse('2026-06-02T00:00:00.000Z'),
      posts: [
        { postId: '3001', status: 'announce', index: 0 },
        { postId: '3002', status: 'start', index: 0 }
      ]
    }
  ]
  await writeFile(join(dir, 'emulated-v1.json'), JSON.stringify(emulated))
  await Promise.all(
    ['1001', '2001', '3001', '4001'].map((postId) =>
      writeFile(
        join(dir, 'clef', QUESTION_VERSION, `${postId}.json`),
        JSON.stringify({
          postId,
          model: 'clef',
          kind: 'event',
          response: { answers: { is_event: { type: 'noul', noul: 0.9 } } }
        })
      )
    )
  )
  await writeFile(
    join(dir, 'gold.json'),
    JSON.stringify({ fetchedAt: '2026-10-08T00:00:00.000Z', source: 'https://biccame-musume.com', events: [] })
  )
  const post = (id: string, kind: DetectPostKind) =>
    JSON.stringify({ id, screenName: 'bic_kashiwa', kind, createdAt: '2026-07-01T00:00:00.000Z' })
  await writeFile(
    join(dir, 'posts.jsonl'),
    `${[
      post('1001', 'quote'),
      post('1002', 'original'),
      post('1003', 'reply'),
      post('2001', 'reply'),
      post('3001', 'original'),
      post('3002', 'reply'),
      post('4001', 'original')
    ].join('\n')}\n`
  )
  const charactersPath = join(root, 'characters.json')
  await writeFile(
    charactersPath,
    JSON.stringify([
      { id: 'kashiwa', character: { name: '柏たん', is_biccame_musume: true } },
      { id: 'biccamera', character: { name: 'ビックカメラ', is_biccame_musume: false } }
    ])
  )
  return { dir, charactersPath }
}

describe('runSeed（posts.jsonl の kind）', () => {
  test('最初の告知・開始がリプライのイベントは作らず、レポートに kind を残す。ログに外した件数が出る', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    db.close()
    const materials = await makeMaterials(root)
    const runOptions: SeedRunOptions = {
      dir: materials.dir,
      cacheRoot: join(root, '.cache'),
      charactersPath: materials.charactersPath,
      dbPath: path,
      apply: false,
      threshold: 0.7,
      force: false,
      reportPath: join(root, '.cache', 'event-detect', 'seed-report.json'),
      now: NOW,
      titles: 'rule'
    }
    const run = await runSeed(runOptions)
    // kashiwa-1: 告知 1001（quote）・開始 1002（original）・終了 1003（reply。終了は可）→ 作る
    // kashiwa-2: 最初の告知 2001 がリプライ → 作らない
    // kashiwa-3: 告知 3001 は original だが、最初の開始 3002 がリプライ → 作らない
    expect(run.selection.plans.map((plan) => plan.emulatedId)).toEqual(['kashiwa-1'])
    expect(run.selection.replyFirst).toEqual({ announce: 1, start: 1, both: 0 })
    // biccamera-1 は店舗がビッカメ娘ではない（is_biccame_musume が false）ので作らない
    expect(run.selection.notBiccameMusume).toEqual({ count: 1, byStore: [{ store: 'biccamera', count: 1 }] })
    const biccameStage = run.selection.stages.find((stage) => stage.label.includes('ビッカメ娘の店舗である'))
    expect(biccameStage).toEqual({ label: expect.any(String), excluded: 1, remaining: 1 })
    const report = JSON.parse(await readFile(runOptions.reportPath, 'utf8'))
    expect(report.events[0].referenceUrls).toEqual([
      { type: 'announce', url: url('1001'), kind: 'quote' },
      { type: 'start', url: url('1002'), kind: 'original' },
      { type: 'end', url: url('1003'), kind: 'reply' }
    ])
    expect(report.events[0].endedAtEstimated).toBe(true)
    // 最後の言及（2026-08-01 JST）から基準日（2026-10-10）まで 70 日 → 最後の言及の日を終了日に推定する
    expect(report.events[0].endedAt).toBe('2026-08-01')
    expect(report.replyFirst).toEqual({ announce: 1, start: 1, both: 0 })
    expect(report.notBiccameMusume).toEqual({ count: 1, byStore: [{ store: 'biccamera', count: 1 }] })
    const lines = describeSeed(runOptions, run).join('\n')
    expect(lines).toContain(
      '最初の告知・開始の言及がリプライ（リツイート）のため作らなかった: 2 件（告知=1 開始=1 両方=0）'
    )
    expect(lines).toContain(
      'ビッカメ娘の店舗ではない（characters.json の is_biccame_musume が false）ため作らなかった: 1 件（biccamera×1）'
    )
    expect(lines).toContain('基準日 2026-10-10')
  })
})
