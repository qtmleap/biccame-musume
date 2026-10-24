import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { EventCategorySchema, EventCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { z } from 'zod'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const caseSchema = z.object({
  id: z.string().nonempty(),
  source: z.literal('public-post'),
  description: z.string().nonempty(),
  post: DetectPostSchema,
  expected: z.record(z.string().nonempty(), z.unknown()),
  rationale: z.string().nonempty(),
  tags: z.array(z.string().nonempty()),
  group: z.string().nonempty(),
  reviewStatus: z.literal('provisional')
})
const manifestSchema = z.object({
  datasetRevision: z.literal('historical-positive-c-v1'),
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
  const groups = await Promise.all(
    files.map(async (file) => {
      const raw: unknown = await Bun.file(new URL(file, directory)).json()
      const parsed = z.array(caseSchema).safeParse(raw)
      if (!parsed.success) throw new Error(`Invalid benchmark corpus: ${file}`)
      return parsed.data
    })
  )
  return groups.flat()
}
const conditionSchema = z.object({
  type: z.enum(['purchase', 'charge', 'first_come', 'lottery', 'everyone']),
  amount: z.number().int().nonnegative().optional(),
  quantity: z.number().int().positive().optional()
})
const normalize = (text: string) => text.normalize('NFKC').replaceAll(/\s+/g, '')

test('historical positive corpus keeps 50 distinct public campaigns outside the frozen A/B cases', async () => {
  const cases = await loadCases(/^c-\d{2}\.json$/)
  const existing = await loadCases(/^[ab]-\d{2}\.json$/)
  const existingIds = new Set(existing.map((item) => item.post.id))
  const existingGroups = new Set(existing.map((item) => item.group))
  const existingTexts = new Set(existing.map((item) => normalize(item.post.text)))
  expect(cases).toHaveLength(50)
  expect(new Set(cases.map((item) => item.post.id)).size).toBe(50)
  expect(new Set(cases.map((item) => item.group)).size).toBe(50)
  expect(new Set(cases.map((item) => normalize(item.post.text))).size).toBe(50)
  for (const item of cases) {
    expect(existingIds.has(item.post.id)).toBe(false)
    expect(existingGroups.has(item.group)).toBe(false)
    expect(existingTexts.has(normalize(item.post.text))).toBe(false)
    expect(item.expected.isEvent).toBe(true)
    expect(item.post.createdAt < '2026-09-25').toBe(true)
    expect(item.post.kind).toBe('original')
    expect(item.tags).toContain('historical')
    if (item.expected.category !== undefined)
      expect(EventCategorySchema.safeParse(item.expected.category).success).toBe(true)
    if (item.expected.stores !== undefined)
      expect(z.array(StoreKeySchema).safeParse(item.expected.stores).success).toBe(true)
    if (item.expected.characterIds !== undefined)
      expect(z.array(EventCharacterSchema).safeParse(item.expected.characterIds).success).toBe(true)
    if (item.expected.startDate !== undefined)
      expect(z.iso.date().safeParse(item.expected.startDate).success).toBe(true)
    if (item.expected.conditions !== undefined)
      expect(z.array(conditionSchema).safeParse(item.expected.conditions).success).toBe(true)
  }
})

test('historical provenance freezes the archived text and date without depending on local raw archives in CI', async () => {
  const cases = await loadCases(/^c-\d{2}\.json$/)
  const raw: unknown = await Bun.file(new URL('historical-c-provenance.json', directory)).json()
  const parsed = manifestSchema.safeParse(raw)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return
  expect(parsed.data.posts).toHaveLength(cases.length)
  for (const item of cases) {
    const source = parsed.data.posts.find((post) => post.id === item.post.id)
    expect(source?.createdAt).toBe(item.post.createdAt)
    expect(source?.textSha256).toBe(createHash('sha256').update(item.post.text).digest('hex'))
  }
})

test('historical cases distinguish charge issuance, charge capability and another store character', async () => {
  const cases = await loadCases(/^c-\d{2}\.json$/)
  const charged = cases.find((item) => item.post.id === '2082759852586356905')
  expect(charged?.expected.conditions).toEqual([
    { type: 'charge', amount: 1000 },
    { type: 'first_come', quantity: 70 }
  ])
  const capability = cases.find((item) => item.post.id === '2072164014659129855')
  expect(capability?.expected.category).toBe('other')
  expect(capability?.expected.stores).toEqual(['itt'])
  expect(capability?.expected.characterIds).toEqual(['photo'])
  expect(capability?.expected).not.toHaveProperty('conditions')
  const closed = cases.find((item) => item.post.id === '2004043998965690726')
  expect(closed?.expected.stores).toEqual(['nanba'])
  expect(closed?.expected.characterIds).toEqual(['kyoto'])
  const venueOnly = cases.find((item) => item.post.id === '1974383990632067283')
  expect(venueOnly?.expected).not.toHaveProperty('characterIds')
  const limitedQuantity = cases.find((item) => item.post.id === '2011657094525595932')
  expect(limitedQuantity?.expected).not.toHaveProperty('conditions')
})
