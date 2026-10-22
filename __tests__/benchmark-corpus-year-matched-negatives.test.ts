import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const caseSchema = z.object({
  id: z.string().regex(/^public-(?:[bcdef]-)?\d+$/),
  source: z.literal('public-post'),
  post: DetectPostSchema,
  expected: z.record(z.string().nonempty(), z.unknown()),
  rationale: z.string().nonempty(),
  tags: z.array(z.string().nonempty()),
  group: z.string().nonempty(),
  reviewStatus: z.literal('provisional')
})
const provenanceSchema = z.object({
  datasetRevision: z.literal('historical-negative-f-v1-year-matched'),
  annotationStatus: z.literal('provisional'),
  matching: z.object({
    yearCounts: z.record(z.string().regex(/^\d{4}$/), z.number().int().positive()),
    yearAccountCountsExact: z.literal(true),
    positiveTextLengthMean: z.number().positive(),
    negativeTextLengthMean: z.number().positive()
  }),
  posts: z.array(
    z.object({
      id: z.string().nonempty(),
      createdAt: z.iso.datetime(),
      textSha256: z.string().regex(/^[a-f0-9]{64}$/)
    })
  )
})
const load = async (pattern: RegExp) => {
  const files = (await readdir(directory)).filter((file) => pattern.test(file)).toSorted()
  const chunks = await Promise.all(
    files.map(async (file) => {
      const raw: unknown = await Bun.file(new URL(file, directory)).json()
      const parsed = z.array(caseSchema).safeParse(raw)
      if (!parsed.success) throw new Error(`Invalid benchmark cases: ${file}`)
      return parsed.data
    })
  )
  return chunks.flat()
}
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\s+/g, '')
const counts = (keys: string[]) => {
  const result = new Map<string, number>()
  for (const key of keys) {
    const previous = result.get(key)
    result.set(key, previous === undefined ? 1 : previous + 1)
  }
  return Object.fromEntries([...result].toSorted(([a], [b]) => a.localeCompare(b)))
}

// 最終評価用の正負を同じ年代・投稿者にし、年や店舗だけでラベルを識別できないようにする。
test('F50 matches E50 by year and account while preserving 50 independent negatives', async () => {
  const negative = await load(/^f-\d{2}\.json$/)
  const positive = await load(/^e-\d{2}\.json$/)
  const existing = await load(/^[abcde]-\d{2}\.json$/)
  expect(negative).toHaveLength(50)
  expect(positive).toHaveLength(50)
  const year = (post: z.infer<typeof DetectPostSchema>) => post.createdAt.slice(0, 4)
  const accountYear = (post: z.infer<typeof DetectPostSchema>) => `${year(post)}:${post.screenName.toLowerCase()}`
  expect(counts(negative.map((item) => year(item.post)))).toEqual(counts(positive.map((item) => year(item.post))))
  expect(counts(negative.map((item) => accountYear(item.post)))).toEqual(
    counts(positive.map((item) => accountYear(item.post)))
  )
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  expect(
    Math.abs(mean(negative.map((item) => item.post.text.length)) - mean(positive.map((item) => item.post.text.length)))
  ).toBeLessThan(10)
  const ids = new Set(existing.map((item) => item.post.id))
  const groups = new Set(existing.map((item) => item.group))
  const texts = new Set(existing.map((item) => normalize(item.post.text)))
  expect(new Set(negative.map((item) => item.post.id)).size).toBe(50)
  expect(new Set(negative.map((item) => item.group)).size).toBe(50)
  expect(new Set(negative.map((item) => normalize(item.post.text))).size).toBe(50)
  for (const item of negative) {
    expect(ids.has(item.post.id)).toBe(false)
    expect(groups.has(item.group)).toBe(false)
    expect(texts.has(normalize(item.post.text))).toBe(false)
    expect(item.expected).toEqual({ isEvent: false })
    expect(item.post.kind).toBe('original')
    expect(item.tags).toContain('year-matched')
  }
})

test('F source text and date remain independently verifiable without raw archives in CI', async () => {
  const cases = await load(/^f-\d{2}\.json$/)
  const raw: unknown = await Bun.file(new URL('historical-f-provenance.json', directory)).json()
  const parsed = provenanceSchema.safeParse(raw)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return
  expect(parsed.data.posts).toHaveLength(50)
  expect(counts(cases.map((item) => item.post.createdAt.slice(0, 4)))).toEqual(parsed.data.matching.yearCounts)
  for (const item of cases) {
    const original = parsed.data.posts.find((post) => post.id === item.post.id)
    expect(original?.createdAt).toBe(item.post.createdAt)
    expect(original?.textSha256).toBe(createHash('sha256').update(item.post.text).digest('hex'))
  }
})
