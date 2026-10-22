import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { BenchmarkCaseSchema, type BenchmarkCase } from './benchmark-schema'
import { benchmarkTextHash } from './benchmark-corpus'
import { goalHash } from './goal-pipeline-module'

export const GOAL_DIAGNOSTIC_POSTS = new Set([
  '2112378276735750637',
  '2110185622703087712',
  '2112454018958320030',
  '2112379378332217763',
  '2111747466014126157',
  '2111264695357493627',
  '2109936013363830801',
  '2109941892930814125',
  '2110266960051417367',
  '2110287829914026178',
  '2109952352283439532',
  '2112392477038780586'
])

export const loadGoalCorpus = async (directory = 'scripts/data/event-detection-benchmark') => {
  const files = (await readdir(directory)).filter((file) => /^[a-f]-\d+\.json$/.test(file)).sort()
  const rows: BenchmarkCase[] = []
  for (const file of files) {
    const raw: unknown = JSON.parse(await readFile(join(directory, file), 'utf8'))
    const parsed = z.array(BenchmarkCaseSchema).safeParse(raw)
    if (!parsed.success) throw new Error(`Invalid goal corpus: ${file}`)
    rows.push(...parsed.data)
  }
  const seenIds = new Set<string>()
  const seenTexts = new Set<string>()
  const cases = rows.filter((sample) => {
    const hash = benchmarkTextHash(sample.post.text)
    if (seenIds.has(sample.post.id) || seenTexts.has(hash)) return false
    seenIds.add(sample.post.id)
    seenTexts.add(hash)
    return true
  })
  return { cases, files, rawCount: rows.length }
}

// 診断例は別タグで保持し、評価集合は企画ごと一件・固定seedで選ぶ。
export const selectGoalCohort = (cases: BenchmarkCase[], size = 200, seed = 'goal-pipeline-v1') => {
  if (!Number.isInteger(size) || size < 100) throw new Error('Goal evaluation requires at least 100 cases')
  const ordered = cases.toSorted((a, b) => goalHash(`${seed}:${a.id}`).localeCompare(goalHash(`${seed}:${b.id}`)))
  const diagnostic = ordered.filter((sample) => GOAL_DIAGNOSTIC_POSTS.has(sample.post.id))
  const groups = new Set(diagnostic.map((sample) => sample.group))
  const independent = ordered.filter((sample) => {
    if (groups.has(sample.group)) return false
    groups.add(sample.group)
    return true
  })
  const positives = independent.filter((sample) => sample.expected.isEvent)
  const negatives = independent.filter((sample) => !sample.expected.isEvent)
  const selected = [...positives.slice(0, Math.ceil(size / 2)), ...negatives.slice(0, Math.floor(size / 2))]
  if (selected.length < size) throw new Error(`Only ${selected.length} independent balanced goal cases; need ${size}`)
  return {
    cases: selected,
    diagnostic,
    seed,
    size,
    positive: selected.filter((sample) => sample.expected.isEvent).length,
    negative: selected.filter((sample) => !sample.expected.isEvent).length,
    inputHash: goalHash(selected)
  }
}
