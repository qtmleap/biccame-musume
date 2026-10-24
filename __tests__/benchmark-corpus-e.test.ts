import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { z } from 'zod'
import { BenchmarkCaseSchema } from '../scripts/lib/event-detect/benchmark-schema'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const normalize = (text: string) => text.normalize('NFKC').replaceAll(/\s+/g, '')
const load = async (pattern: RegExp) => {
  const files = (await readdir(directory)).filter((file) => pattern.test(file)).toSorted()
  const groups = await Promise.all(
    files.map(async (file) => {
      const raw: unknown = await Bun.file(new URL(file, directory)).json()
      const parsed = z.array(BenchmarkCaseSchema).safeParse(raw)
      if (!parsed.success) throw new Error(`Invalid fresh positive corpus: ${file}`)
      return parsed.data
    })
  )
  return groups.flat()
}

test('fresh final positive corpus has fifty independent public official original posts', async () => {
  const cases = await load(/^e-\d{2}\.json$/)
  expect(cases).toHaveLength(50)
  expect(new Set(cases.map((sample) => sample.post.id)).size).toBe(50)
  expect(new Set(cases.map((sample) => sample.group)).size).toBe(50)
  expect(new Set(cases.map((sample) => normalize(sample.post.text))).size).toBe(50)
  for (const sample of cases) {
    expect(sample.id).toBe(`public-e-${sample.post.id}`)
    expect(sample.source).toBe('public-post')
    expect(sample.expected.isEvent).toBe(true)
    expect(sample.reviewStatus).toBe('provisional')
    expect(sample.post.kind).toBe('original')
    expect(sample.rationale.length).toBeGreaterThan(10)
    expect(sample.tags).toContain('fresh-final')
    expect(sample.sourceTextHash).toBe(createHash('sha256').update(sample.post.text).digest('hex'))
  }
})

test('fresh positives do not reuse earlier corpora or development campaigns', async () => {
  const cases = await load(/^e-\d{2}\.json$/)
  const previous = await load(/^[abcd]-\d{2}\.json$/)
  const ids = new Set(previous.map((sample) => sample.post.id))
  const texts = new Set(previous.map((sample) => normalize(sample.post.text)))
  const groups = new Set(previous.map((sample) => sample.group))
  for (const sample of cases) {
    expect(ids.has(sample.post.id)).toBe(false)
    expect(texts.has(normalize(sample.post.text))).toBe(false)
    expect(groups.has(sample.group)).toBe(false)
    expect(sample.post.createdAt < '2025-01-01').toBe(true)
  }
})
