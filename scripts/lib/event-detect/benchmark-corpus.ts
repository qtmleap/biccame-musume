import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { type BenchmarkCase, BenchmarkCaseSchema } from './benchmark-schema'

export const DEVELOPMENT_POST_IDS = new Set(['2112392477038780586', '2112431406978945270', '2112435987582513432'])
export const BOUNDARY_POST_IDS = new Set(['2111633864368210298', '2110626732063805924'])
export const normalizedBenchmarkText = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\s+/g, ' ')
    .trim()
export const benchmarkTextHash = (text: string) =>
  createHash('sha256').update(normalizedBenchmarkText(text)).digest('hex')
const hashOrder = (seed: string, id: string) => createHash('sha256').update(`${seed}:${id}`).digest('hex')

export const validateBenchmarkCorpus = (rows: unknown[]) => {
  const parsed = z.array(BenchmarkCaseSchema).safeParse(rows)
  if (!parsed.success) throw new Error(`Invalid benchmark corpus: ${parsed.error.message}`)
  const ids = new Set<string>()
  const texts = new Set<string>()
  const duplicates: { id: string; reason: string }[] = []
  const cases = parsed.data.filter((sample) => {
    const textHash = benchmarkTextHash(sample.post.text)
    const rawHash = createHash('sha256').update(sample.post.text).digest('hex')
    const annotationHash = createHash('sha256')
      .update(sample.post.text.normalize('NFKC').replace(/\s+/g, ' ').trim())
      .digest('hex')
    if (
      (sample.sourceHash !== undefined && sample.sourceHash !== annotationHash) ||
      (sample.sourceTextHash !== undefined && sample.sourceTextHash !== rawHash)
    )
      throw new Error(`Source text hash mismatch: ${sample.id}`)
    const reason = ids.has(sample.post.id) ? 'post-id' : texts.has(textHash) ? 'normalized-text' : null
    if (reason !== null) {
      duplicates.push({ id: sample.id, reason })
      return false
    }
    ids.add(sample.post.id)
    texts.add(textHash)
    return true
  })
  return { cases, duplicates }
}

export const loadBenchmarkCorpus = async (directory = 'scripts/data/event-detection-benchmark') => {
  const files = (await readdir(directory)).filter((file) => /^[ab]-\d+\.json$/.test(file)).sort()
  if (files.length === 0) throw new Error('Benchmark corpus is empty')
  const groups = await Promise.all(
    files.map(async (file) => {
      const raw: unknown = JSON.parse(await readFile(join(directory, file), 'utf8'))
      if (!Array.isArray(raw)) throw new Error(`Benchmark corpus file is not an array: ${file}`)
      return raw
    })
  )
  return { files, ...validateBenchmarkCorpus(groups.flat()) }
}

// 同じ企画を別ケースとして数えず、調整用投稿を除いた固定集合を作る。
export const selectBenchmarkHoldout = (cases: BenchmarkCase[], limit = 100, seed = 'biccame-v8-holdout-20261020') => {
  if (!Number.isInteger(limit) || limit < 100) throw new Error('Holdout requires at least 100 cases')
  const developmentGroups = new Set(
    cases.filter((sample) => DEVELOPMENT_POST_IDS.has(sample.post.id)).map((sample) => sample.group)
  )
  const groups = new Set<string>()
  const excluded: { id: string; reason: string }[] = []
  const ordered = cases.toSorted((a, b) => hashOrder(seed, a.id).localeCompare(hashOrder(seed, b.id)))
  const independent = ordered.filter((sample) => {
    const reason =
      DEVELOPMENT_POST_IDS.has(sample.post.id) || developmentGroups.has(sample.group)
        ? 'development-group'
        : BOUNDARY_POST_IDS.has(sample.post.id)
          ? 'boundary'
          : groups.has(sample.group)
            ? 'campaign-group'
            : null
    if (reason !== null) {
      excluded.push({ id: sample.id, reason })
      return false
    }
    groups.add(sample.group)
    return true
  })
  const positives = independent.filter((sample) => sample.expected.isEvent)
  const negatives = independent.filter((sample) => !sample.expected.isEvent)
  const positiveCount = Math.min(positives.length, Math.ceil(limit / 2))
  const negativeCount = Math.min(negatives.length, limit - positiveCount)
  const selected = [...positives.slice(0, positiveCount), ...negatives.slice(0, negativeCount)]
  const remainder = independent.filter((sample) => !selected.some((item) => item.id === sample.id))
  const result = [...selected, ...remainder.slice(0, limit - selected.length)]
  if (result.length < limit) throw new Error(`Only ${result.length} independent holdout cases; need ${limit}`)
  return {
    cases: result.toSorted((a, b) => hashOrder(seed, a.id).localeCompare(hashOrder(seed, b.id))),
    excluded,
    seed,
    available: independent.length,
    distribution: {
      positive: result.filter((sample) => sample.expected.isEvent).length,
      negative: result.filter((sample) => !sample.expected.isEvent).length
    }
  }
}
