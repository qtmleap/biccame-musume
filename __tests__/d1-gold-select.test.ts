import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type GoldCase, goldModelPost, loadGoldCases } from '../scripts/lib/event-detect/d1-gold-schema'
import {
  allocateStrata,
  hasExplicitCharacter,
  selectGoldCohort,
  stratumOf
} from '../scripts/lib/event-detect/d1-gold-select'
import { goldCase, goldEvent, SENTINEL } from './d1-gold-fixtures'

const population = (): GoldCase[] =>
  Array.from({ length: 60 }, (_, index) =>
    goldCase(index, {
      postCreatedAtJst: `${index % 3 === 0 ? '2025' : '2026'}-03-10 09:00`,
      events: [
        goldEvent({
          uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          category: index % 4 === 0 ? 'ackey' : 'limited_card'
        })
      ]
    })
  )

test('goldModelPost keeps public post fields only and drops gold, annotations and extraction context', () => {
  const sample = {
    ...goldCase(1),
    events: [goldEvent({ title: SENTINEL })],
    post: {
      ...goldCase(1).post,
      extractionContext: { kind: 'event', item: SENTINEL, evidence: [SENTINEL], originalText: SENTINEL }
    }
  }
  const model = goldModelPost(sample)
  expect(JSON.stringify(model)).not.toContain(SENTINEL)
  expect(model).not.toHaveProperty('extractionContext')
  expect(model).toEqual(goldCase(1).post)
})

test('the same seed gives the same ordered cohort and a different seed gives a different one', () => {
  const cases = population()
  const a = selectGoldCohort(cases, 20, 'seed-a')
  const b = selectGoldCohort([...cases].reverse(), 20, 'seed-a')
  const c = selectGoldCohort(cases, 20, 'seed-b')
  expect(a.selection.caseIds).toEqual(b.selection.caseIds)
  expect(a.selection.caseIdsSha256).toBe(b.selection.caseIdsSha256)
  expect(a.selection.caseIds).not.toEqual(c.selection.caseIds)
  expect(new Set(a.selection.caseIds).size).toBe(20)
})

test('stratified allocation sums to the size, gives every stratum at least one and never exceeds a population', () => {
  const populations = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 50],
    ['d', 47]
  ])
  const allocation = allocateStrata(populations, 30)
  expect([...allocation.values()].reduce((sum, n) => sum + n, 0)).toBe(30)
  for (const [key, n] of allocation) {
    const limit = populations.get(key)
    if (limit === undefined) throw new Error('unknown stratum')
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(limit)
  }
  expect(() => allocateStrata(populations, 3)).toThrow('Invalid cohort size')
  expect(() => allocateStrata(populations, 101)).toThrow('Invalid cohort size')
})

test('selection covers every stratum and the strata are post year x primary category', () => {
  const cases = population()
  const { selection, cases: chosen } = selectGoldCohort(cases, 24, 'seed-a')
  expect(selection.strata.every((stratum) => stratum.selected >= 1)).toBe(true)
  expect(new Set(chosen.map(stratumOf)).size).toBe(selection.strata.length)
  expect(stratumOf(cases[0])).toBe('2025|ackey')
  expect(selection.events).toBe(chosen.length)
})

test('the execution order is the global hash order, so a truncated run is still a random subset', () => {
  const cases = population()
  const small = selectGoldCohort(cases, 24, 'seed-a')
  // 先頭から切り出した部分集合は、層ごとの割当を満たさなくても全体の無作為順になっている。
  expect(small.selection.caseIds).toHaveLength(24)
  expect(small.selection.caseIds).toEqual(small.cases.map((sample) => sample.caseId))
})

test('loadGoldCases rejects invalid or duplicated input and reports sidelined counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd1-gold-load-'))
  try {
    const good = join(directory, 'cases.json')
    const sample = goldCase(1)
    await writeFile(
      good,
      JSON.stringify({ schemaVersion: 1, main: [sample], sidelined: { retweet: [], post_after_start: [1, 2] } })
    )
    const loaded = await loadGoldCases(good)
    expect(loaded.cases).toHaveLength(1)
    expect(loaded.sidelined).toEqual({ retweet: 0, post_after_start: 2 })
    const duplicated = join(directory, 'dup.json')
    await writeFile(duplicated, JSON.stringify({ schemaVersion: 1, main: [sample, sample], sidelined: {} }))
    await expect(loadGoldCases(duplicated)).rejects.toThrow('Duplicated post')
    const broken = join(directory, 'broken.json')
    await writeFile(broken, JSON.stringify({ schemaVersion: 1, main: [{ ...sample, events: [] }], sidelined: {} }))
    await expect(loadGoldCases(broken)).rejects.toThrow('Invalid D1 gold case file')
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('every post with an explicit D1 character is forced into the cohort and the rest is stratified', () => {
  const cases = population().map((sample, index) =>
    index % 10 === 0 ? { ...sample, events: [{ ...sample.events[0], characterIds: ['kyoto'] }] } : sample
  )
  const forcedIds = cases.filter(hasExplicitCharacter).map((sample) => sample.caseId)
  expect(forcedIds).toHaveLength(6)
  const { selection, cases: chosen } = selectGoldCohort(cases, 24, 'seed-a')
  for (const id of forcedIds) expect(selection.caseIds).toContain(id)
  expect(selection.forcedCaseIds).toEqual([...forcedIds].sort())
  expect(selection.forced).toMatchObject({ population: 6, selected: 6 })
  expect(chosen).toHaveLength(24)
  // 専用枠を除いた残りの層は、専用枠の投稿を含まない母集団から配分している。
  expect(selection.strata.reduce((sum, stratum) => sum + stratum.selected, 0)).toBe(18)
  expect(selection.strata.reduce((sum, stratum) => sum + stratum.population, 0)).toBe(54)
  expect(() => selectGoldCohort(cases, 6, 'seed-a')).toThrow('Invalid cohort size')
})
