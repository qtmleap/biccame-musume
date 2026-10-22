import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const caseSchema = z.object({
  id: z.string().regex(/^public-(?:[bcd]-)?\d+$/),
  source: z.literal('public-post'),
  description: z.string().nonempty(),
  post: DetectPostSchema,
  expected: z.record(z.string().nonempty(), z.unknown()),
  rationale: z.string().nonempty(),
  tags: z.array(z.string().nonempty()),
  group: z.string().nonempty(),
  reviewStatus: z.literal('provisional')
})
const provenanceSchema = z.object({
  datasetRevision: z.literal('historical-negative-d-v1'),
  annotationStatus: z.literal('provisional'),
  posts: z.array(
    z.object({
      id: z.string().nonempty(),
      createdAt: z.iso.datetime(),
      textSha256: z.string().regex(/^[a-f0-9]{64}$/)
    })
  )
})
const loadCases = async (pattern: RegExp) => {
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

// このテストは追跡可能なfixtureだけを使い、CIに生アーカイブやD1を要求しない。
test('final negative holdout keeps 50 unique campaigns outside development and positive corpora', async () => {
  const cases = await loadCases(/^d-\d{2}\.json$/)
  const existing = await loadCases(/^[abc]-\d{2}\.json$/)
  const ids = new Set(existing.map((item) => item.post.id))
  const groups = new Set(existing.map((item) => item.group))
  const texts = new Set(existing.map((item) => normalize(item.post.text)))
  expect(cases).toHaveLength(50)
  expect(new Set(cases.map((item) => item.post.id)).size).toBe(50)
  expect(new Set(cases.map((item) => item.group)).size).toBe(50)
  expect(new Set(cases.map((item) => normalize(item.post.text))).size).toBe(50)
  expect(new Set(cases.map((item) => item.post.screenName.toLowerCase())).size).toBeGreaterThanOrEqual(20)
  for (const item of cases) {
    expect(ids.has(item.post.id)).toBe(false)
    expect(groups.has(item.group)).toBe(false)
    expect(texts.has(normalize(item.post.text))).toBe(false)
    expect(item.expected).toEqual({ isEvent: false })
    expect(item.post.kind).toBe('original')
    expect(item.post.createdAt >= '2025-10-01' && item.post.createdAt < '2026-09-01').toBe(true)
    expect(item.tags).toContain('hard-negative')
    expect(item.rationale.length).toBeGreaterThan(15)
  }
})

test('negative holdout provenance preserves the archived text and date without local archive access', async () => {
  const cases = await loadCases(/^d-\d{2}\.json$/)
  const raw: unknown = await Bun.file(new URL('historical-d-provenance.json', directory)).json()
  const parsed = provenanceSchema.safeParse(raw)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return
  expect(parsed.data.posts).toHaveLength(50)
  for (const item of cases) {
    const source = parsed.data.posts.find((post) => post.id === item.post.id)
    expect(source?.createdAt).toBe(item.post.createdAt)
    expect(source?.textSha256).toBe(createHash('sha256').update(item.post.text).digest('hex'))
  }
})

test('negative holdout distinguishes other IP giveaways and character mentions from daughter campaigns', async () => {
  const cases = await loadCases(/^d-\d{2}\.json$/)
  expect(cases.filter((item) => item.tags.includes('other-ip')).length).toBeGreaterThanOrEqual(20)
  expect(cases.filter((item) => item.tags.includes('ordinary-event')).length).toBeGreaterThanOrEqual(5)
  expect(cases.filter((item) => item.tags.includes('giveaway')).length).toBeGreaterThanOrEqual(5)
  expect(cases.some((item) => item.tags.includes('character-mention'))).toBe(true)
  expect(cases.some((item) => item.tags.includes('multi-character-mention'))).toBe(true)
  expect(cases.some((item) => item.tags.includes('payment'))).toBe(true)
})
