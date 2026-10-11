import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { analyze } from '../../scripts/lib/event-detect/analysis'
import { cacheKey } from '../../scripts/lib/event-detect/decide'
import { buildEvalSet, buildRequest, runDecisions } from '../../scripts/lib/event-detect/evaluate'
import type { GoldEvent } from '../../scripts/lib/event-detect/gold'
import { writeAtomic } from '../../scripts/lib/event-detect/store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const directory = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-cache-'))
  directories.push(path)
  return path
}
const post: DetectPost = {
  id: '1',
  createdAt: '2026-06-01T01:00:00.000Z',
  screenName: 'bic_example',
  kind: 'original',
  text: 'おはようございます',
  url: 'https://x.com/bic_example/status/1',
  media: []
}
const accounts = [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }]
const storeNames = new Map([['example', ['例たん']]])
const event: GoldEvent = {
  uuid: '00000000-0000-4000-8000-000000000001',
  title: '夏名刺',
  category: 'limited_card',
  stores: ['example'],
  startDate: '2026-06-01T00:00:00.000Z',
  conditions: [],
  isPreliminary: false,
  referenceUrls: [{ type: 'announce', url: post.url }]
}

test('keyword-dropped gold posts are evaluated once as gold instead of negative samples', () => {
  const analysis = analyze({
    posts: [post, { ...post, id: '2' }],
    events: [event],
    accounts,
    characterNames: ['例たん']
  })
  const samples = buildEvalSet(analysis, { passed: 10, dropped: 10, seed: 1 })
  expect(samples.map(({ row, kind }) => [row.post.id, kind])).toEqual([
    ['1', 'gold'],
    ['2', 'negative_dropped']
  ])
})

test('an interrupted decision cache is replaced and the completed result is reused', async () => {
  const cacheDir = await directory()
  const analysis = analyze({ posts: [post], events: [event], accounts, characterNames: ['例たん'] })
  const row = analysis.rows[0]
  const { request } = buildRequest(row, analysis, accounts, storeNames)
  const path = join(cacheDir, `${cacheKey('clef', request)}.json`)
  await writeFile(path, '{"postId":')
  const response = { answers: { is_event: { type: 'noul', noul: 1 } } }
  const preconnect = globalThis.fetch.preconnect
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(response), { preconnect })
  )
  const options = {
    samples: [{ row, kind: 'gold' as const }],
    models: ['clef' as const],
    analysis,
    accounts,
    storeNames,
    endpoint: 'http://127.0.0.1/unused-mocked-endpoint',
    cacheDir,
    concurrency: 1
  }
  try {
    const result = await runDecisions(options)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ postId: '1', model: 'clef', kind: 'gold', response })
    const stored = JSON.parse(await readFile(path, 'utf8'))
    expect(stored).toEqual(result[0])
    fetch.mockImplementation(
      Object.assign(
        async () => {
          throw new Error('A completed cache must not request the model again')
        },
        { preconnect }
      )
    )
    expect(await runDecisions(options)).toEqual(result)
  } finally {
    fetch.mockRestore()
  }
})

test('concurrent atomic writes leave a complete file and all writers finish successfully', async () => {
  const path = join(await directory(), 'cache.json')
  const outcomes = await Promise.allSettled(
    Array.from({ length: 32 }, (_, value) => writeAtomic(path, JSON.stringify({ value })))
  )
  expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true)
  const stored = JSON.parse(await readFile(path, 'utf8'))
  expect(Number.isInteger(stored.value) && stored.value >= 0 && stored.value < 32).toBe(true)
})
