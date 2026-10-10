import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { analyze } from '../../scripts/lib/event-detect/analysis'
import {
  type ClefCall,
  type ClefTarget,
  clefCost,
  probabilityHistogram,
  readRepresentativePosts,
  runClefEvents
} from '../../scripts/lib/event-detect/clef-run'
import { cacheKey, QUESTION_VERSION } from '../../scripts/lib/event-detect/decide'
import { buildRequest, type Decision } from '../../scripts/lib/event-detect/evaluate'
import { EMULATED_FILE, readJudgements } from '../../scripts/lib/event-detect/store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const directory = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-clef-run-'))
  directories.push(path)
  return path
}

const accounts = [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }]
const storeNames = new Map([['example', ['例たん']]])

/** 本文を投稿ごとに変える。cacheKey は投稿 ID を含まないので、同じ本文・同じ投稿日だと同じファイルを共有する */
const post = (id: string, createdAt: string): DetectPost => ({
  id,
  createdAt,
  screenName: 'bic_example',
  kind: 'original',
  text: `名刺の配布は ${id} 番の告知です`,
  url: `https://x.com/bic_example/status/${id}`,
  media: []
})

const posts = [
  post('1', '2026-06-01T01:00:00.000Z'),
  post('2', '2026-06-02T01:00:00.000Z'),
  post('3', '2026-06-03T01:00:00.000Z'),
  post('4', '2026-06-04T01:00:00.000Z')
]
const analysis = analyze({ posts, events: [], accounts, characterNames: ['例たん'] })
const targetOf = (id: string): ClefTarget => {
  const row = analysis.rowById.get(id)
  if (!row) throw new Error(`no row ${id}`)
  return { postId: id, time: row.time }
}

const response = (noul: number, inputTokens = 1000): ClefResponse => ({
  answers: { is_event: { type: 'noul', noul } },
  usage: { input_tokens: inputTokens, output_tokens: 0 }
})

/** 偽の Clef。呼ばれた request の state を記録し、failOn を含む state のときは失敗する */
const fakeCall = (options: { noul?: number; failOn?: string[] } = {}) => {
  const requests: ClefRequest[] = []
  const call: ClefCall = async (_endpoint, request) => {
    requests.push(request)
    if (options.failOn?.some((text) => request.state.includes(text))) throw new Error('Clef 503')
    return response(options.noul === undefined ? 0.5 : options.noul)
  }
  return { call, requests }
}

const run = async (options: {
  targets: readonly ClefTarget[]
  cacheDir: string
  call: ClefCall
  concurrency?: number
  onError?: (target: ClefTarget, error: unknown) => void
}) =>
  runClefEvents({
    targets: options.targets,
    model: 'clef',
    analysis,
    accounts,
    storeNames,
    concurrency: options.concurrency === undefined ? 2 : options.concurrency,
    endpoint: 'http://127.0.0.1/unused',
    cacheDir: options.cacheDir,
    call: options.call,
    ...(options.onError ? { onError: options.onError } : {})
  })

/** emulate が書く EmulatedEvent の形（代表投稿の取り出しに使わない項目も含む） */
const emulatedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'example-1',
  store: 'example',
  item: '夏名刺',
  category: 'limited_card',
  status: 'ongoing',
  startUnknown: false,
  firstSeen: Date.parse('2026-06-01T01:00:00Z'),
  lastSeen: Date.parse('2026-06-20T01:00:00Z'),
  posts: [{ postId: '1', status: 'announce', index: 0 }],
  ...overrides
})

describe('readRepresentativePosts', () => {
  test('各イベントの posts[0] を代表投稿にする（2 件目以降の言及は対象にしない）', async () => {
    const dir = await directory()
    await writeFile(
      join(dir, EMULATED_FILE),
      JSON.stringify([
        emulatedEvent({
          posts: [
            { postId: '1', status: 'announce', index: 0 },
            { postId: '2', status: 'end', index: 0 }
          ]
        })
      ])
    )
    const result = await readRepresentativePosts(dir)
    expect(result.events).toBe(1)
    expect(result.targets.map((target) => target.postId)).toEqual(['1'])
  })

  test('同じ投稿が複数のイベントの代表なら 1 件にまとめ、イベント数は重複除去の前を返す', async () => {
    const dir = await directory()
    await writeFile(
      join(dir, EMULATED_FILE),
      JSON.stringify([
        emulatedEvent({ id: 'example-1' }),
        emulatedEvent({ id: 'example-2', posts: [{ postId: '1', status: 'announce', index: 1 }] }),
        emulatedEvent({ id: 'other-1', store: 'other', posts: [{ postId: '1', status: 'announce', index: 0 }] })
      ])
    )
    const result = await readRepresentativePosts(dir)
    expect(result.events).toBe(3)
    expect(result.targets).toHaveLength(1)
  })

  test('対象は投稿時刻の古い順で、ファイルの並びには依らない', async () => {
    const dir = await directory()
    await writeFile(
      join(dir, EMULATED_FILE),
      JSON.stringify([
        emulatedEvent({ firstSeen: Date.parse('2026-06-03T01:00:00Z'), posts: [{ postId: '3' }] }),
        emulatedEvent({ firstSeen: Date.parse('2026-06-01T01:00:00Z'), posts: [{ postId: '1' }] }),
        emulatedEvent({ firstSeen: Date.parse('2026-06-02T01:00:00Z'), posts: [{ postId: '2' }] })
      ])
    )
    const { targets } = await readRepresentativePosts(dir)
    expect(targets.map((target) => target.postId)).toEqual(['1', '2', '3'])
    expect(targets.map((target) => target.time)).toEqual([
      Date.parse('2026-06-01T01:00:00Z'),
      Date.parse('2026-06-02T01:00:00Z'),
      Date.parse('2026-06-03T01:00:00Z')
    ])
  })

  test('空の配列も読める（イベントを 1 件も作らなかった結果）', async () => {
    const dir = await directory()
    await writeFile(join(dir, EMULATED_FILE), '[]')
    expect(await readRepresentativePosts(dir)).toEqual({ events: 0, targets: [] })
  })

  test('ファイルが無い・形が合わないときは、ファイル名付きのエラーで emulate の再実行を案内する', async () => {
    const dir = await directory()
    const path = join(dir, EMULATED_FILE)
    await expect(readRepresentativePosts(dir)).rejects.toThrow(`${path}: not found (re-run emulate)`)
    for (const broken of [
      '{}',
      '[{"firstSeen":1}]',
      '[{"firstSeen":1,"posts":[]}]',
      '[{"firstSeen":1,"posts":[{"postId":""}]}]',
      '[{"firstSeen":"x","posts":[{"postId":"1"}]}]'
    ]) {
      await writeFile(path, broken)
      await expect(readRepresentativePosts(dir)).rejects.toThrow(`${path}:`)
      await expect(readRepresentativePosts(dir)).rejects.toThrow('(re-run emulate)')
    }
    await writeFile(path, '{"broken":')
    await expect(readRepresentativePosts(dir)).rejects.toThrow('(re-run emulate)')
  })
})

describe('runClefEvents', () => {
  test('保存済みの判定は読むだけで呼ばない', async () => {
    const cacheDir = await directory()
    const first = fakeCall({ noul: 0.8 })
    const initial = await run({ targets: [targetOf('1'), targetOf('2')], cacheDir, call: first.call })
    expect(initial).toMatchObject({ done: 2, total: 2, cached: 0, failed: 0, skipped: 0, inputTokens: 2000 })
    expect(first.requests).toHaveLength(2)

    const second = fakeCall({ noul: 0.1 })
    const again = await run({
      targets: [targetOf('1'), targetOf('2'), targetOf('3')],
      cacheDir,
      call: second.call
    })
    // 3 件目だけが呼ばれる。保存済みの確率は読み直した値（0.8）のまま
    expect(second.requests).toHaveLength(1)
    expect(again).toMatchObject({ done: 3, total: 3, cached: 2, failed: 0, inputTokens: 1000 })
    expect(again.probabilities).toEqual(
      new Map([
        ['1', 0.8],
        ['2', 0.8],
        ['3', 0.1]
      ])
    )
  })

  test('1 件が失敗しても残りを処理し、失敗を数えて onError に渡す。再実行では失敗した分だけを呼ぶ', async () => {
    const cacheDir = await directory()
    const errors: [string, string][] = []
    const flaky = fakeCall({ failOn: ['2 番の告知'] })
    const targets = [targetOf('1'), targetOf('2'), targetOf('3')]
    const result = await run({
      targets,
      cacheDir,
      call: flaky.call,
      onError: (target, error) => errors.push([target.postId, String(error)])
    })
    expect(result).toMatchObject({ done: 3, total: 3, cached: 0, failed: 1 })
    expect(errors).toEqual([['2', 'Error: Clef 503']])
    expect([...result.probabilities.keys()].sort()).toEqual(['1', '3'])
    // 失敗した投稿は保存されない
    expect(await readdir(cacheDir)).toHaveLength(2)

    const retry = fakeCall()
    const again = await run({ targets, cacheDir, call: retry.call })
    expect(retry.requests).toHaveLength(1)
    expect(retry.requests[0].state).toContain('2 番の告知')
    expect(again).toMatchObject({ done: 3, total: 3, cached: 2, failed: 0 })
    expect([...again.probabilities.keys()].sort()).toEqual(['1', '2', '3'])
  })

  test('is_event に答えていない応答は失敗として数え、保存しない', async () => {
    const cacheDir = await directory()
    const errors: unknown[] = []
    const result = await run({
      targets: [targetOf('1')],
      cacheDir,
      call: async () => ({ answers: { status: { type: 'choice', choice: 'none', probabilities: { none: 1 } } } }),
      onError: (_target, error) => errors.push(error)
    })
    expect(result).toMatchObject({ done: 1, failed: 1, cached: 0 })
    expect(errors).toHaveLength(1)
    expect(await readdir(cacheDir)).toHaveLength(0)
  })

  test('分析に無い投稿は対象から外して skipped に数え、onError も呼ばない', async () => {
    const cacheDir = await directory()
    const errors: unknown[] = []
    const fake = fakeCall()
    const result = await run({
      targets: [targetOf('1'), { postId: 'missing', time: 0 }],
      cacheDir,
      call: fake.call,
      onError: (_target, error) => errors.push(error)
    })
    expect(result).toMatchObject({ done: 1, total: 1, skipped: 1, failed: 0 })
    expect(fake.requests).toHaveLength(1)
    expect(errors).toEqual([])
  })

  test('保存した判定は kind が event で、readJudgements の clef に確率として読まれる', async () => {
    const root = await directory()
    const cacheDir = join(root, 'clef', QUESTION_VERSION)
    const fake = fakeCall({ noul: 0.75 })
    await run({ targets: [targetOf('1'), targetOf('2')], cacheDir, call: fake.call })

    const row = analysis.rowById.get('1')
    if (!row) throw new Error('no row 1')
    const { request, endedCandidates } = buildRequest(row, analysis, accounts, storeNames)
    const saved: Decision = JSON.parse(await readFile(join(cacheDir, `${cacheKey('clef', request)}.json`), 'utf8'))
    expect(saved).toMatchObject({ postId: '1', model: 'clef', kind: 'event', request, endedCandidates })
    expect(saved.response.answers.is_event).toEqual({ type: 'noul', noul: 0.75 })

    const judgements = await readJudgements(root)
    expect(judgements.invalid).toBe(0)
    expect(judgements.clef).toEqual(
      new Map([
        ['1', 0.75],
        ['2', 0.75]
      ])
    )
  })

  test('壊れた（途中で切れた）保存ファイルは呼び直して置き換える', async () => {
    const cacheDir = await directory()
    const row = analysis.rowById.get('1')
    if (!row) throw new Error('no row 1')
    const { request } = buildRequest(row, analysis, accounts, storeNames)
    const path = join(cacheDir, `${cacheKey('clef', request)}.json`)
    await writeFile(path, '{"postId":')
    const fake = fakeCall({ noul: 0.6 })
    const result = await run({ targets: [targetOf('1')], cacheDir, call: fake.call })
    expect(result).toMatchObject({ done: 1, cached: 0, failed: 0 })
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ postId: '1', kind: 'event' })
  })

  test('同時実行数を超えて並列に呼ばない', async () => {
    const cacheDir = await directory()
    const state = { running: 0, peak: 0 }
    const call: ClefCall = async () => {
      state.running += 1
      state.peak = Math.max(state.peak, state.running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      state.running -= 1
      return response(0.5)
    }
    const result = await run({ targets: posts.map((entry) => targetOf(entry.id)), cacheDir, call, concurrency: 2 })
    expect(result.done).toBe(4)
    expect(state.peak).toBe(2)
  })
})

describe('probabilityHistogram', () => {
  test('0.1 刻みの 10 区間に数え、1.0 は最後の区間に入れる', () => {
    expect(probabilityHistogram([0, 0.05, 0.1, 0.5, 0.99, 1])).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 2])
    expect(probabilityHistogram([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('clefCost', () => {
  test('clef は入力 100 万トークンあたり $0.24、clef-flash は $0.09', () => {
    expect(clefCost('clef', 1_000_000)).toBeCloseTo(0.24)
    expect(clefCost('clef-flash', 1_000_000)).toBeCloseTo(0.09)
    expect(clefCost('clef', 0)).toBe(0)
  })
})
