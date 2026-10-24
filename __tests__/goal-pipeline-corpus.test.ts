import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { EventCategorySchema, EventCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { z } from 'zod'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const normalized = (value: string) => value.normalize('NFKC').replace(/https?:\/\/\S+|\s+/g, '')
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]: [string, unknown]) => [key, canonical(item)])
    )
  return value
}
const schema = z.object({
  id: z.string().nonempty(),
  source: z.literal('public-post'),
  description: z.string().nonempty(),
  post: DetectPostSchema,
  expected: z.record(z.string().nonempty(), z.unknown()),
  rationale: z.string().nonempty(),
  tags: z.array(z.string().nonempty()),
  group: z.string().nonempty(),
  reviewStatus: z.literal('provisional'),
  stageGold: z.object({
    action: z.enum(['new', 'update', 'end', 'preliminary', 'needs_context', 'not_event']),
    registration: z.enum(['ready', 'needs_info', 'not_new', 'needs_context', 'not_applicable']),
    items: z.array(z.object({ item: z.string().nonempty(), evidence: z.array(z.string().nonempty()).nonempty() })),
    groupingNote: z.string().nonempty(),
    unannotatedFields: z.array(z.string().nonempty())
  }),
  provenance: z.object({
    archive: z.string().nonempty(),
    line: z.number().int().positive(),
    postSha256: z.string().regex(/^[a-f0-9]{64}$/),
    textSha256: z.string().regex(/^[a-f0-9]{64}$/)
  }),
  observedD1: z.object({
    annotationUse: z.literal('diagnostic-only-not-gold-not-model-input'),
    job: z.unknown(),
    candidates: z.array(z.unknown()),
    referencedEvents: z.array(
      z.object({
        url: z.url(),
        referenceType: z.string().nonempty(),
        eventId: z.string().nonempty(),
        title: z.string().nonempty(),
        isVerified: z.boolean(),
        isPreliminary: z.boolean()
      })
    )
  })
})
const readCases = async () => {
  const files = (await readdir(directory)).filter((name) => /^goal-\d{3}\.json$/.test(name)).toSorted()
  const groups = await Promise.all(
    files.map(async (name) => {
      const parsed = z.array(schema).safeParse(await Bun.file(new URL(name, directory)).json())
      if (!parsed.success) throw new Error(`Invalid goal corpus: ${name}`)
      return parsed.data
    })
  )
  return groups.flat()
}

const binsOf = (cases: Awaited<ReturnType<typeof readCases>>, positive: boolean) =>
  cases
    .filter((sample) => sample.expected.isEvent === positive)
    .map((sample) => `${sample.post.createdAt.slice(0, 7)}:${sample.post.screenName.toLowerCase()}`)
    .toSorted()

test('goal corpus has 236 distinct raw public posts and matched year/month/account classes', async () => {
  const cases = await readCases()
  expect(cases).toHaveLength(236)
  expect(new Set(cases.map((sample) => sample.post.id)).size).toBe(236)
  expect(new Set(cases.map((sample) => normalized(sample.post.text))).size).toBe(236)
  expect(new Set(cases.map((sample) => sample.group)).size).toBe(236)
  expect(cases.filter((sample) => sample.expected.isEvent === true)).toHaveLength(118)
  expect(cases.filter((sample) => sample.expected.isEvent === false)).toHaveLength(118)
  expect(binsOf(cases, true)).toEqual(binsOf(cases, false))
  for (const sample of cases) {
    expect(sample.post.kind).toBe('original')
    expect(sample.provenance.textSha256).toBe(hash(sample.post.text))
    expect(sample.post.url).toContain(`/status/${sample.post.id}`)
    expect(sample.tags).toContain('goal-pipeline')
  }
})

test('new cases do not duplicate existing A-F post, text or campaign labels', async () => {
  const cases = await readCases()
  const files = (await readdir(directory)).filter((name) => /^[abcdef]-\d+\.json$/.test(name))
  const referenceSchema = z.array(z.object({ post: DetectPostSchema, group: z.string().nonempty() }))
  const groups = await Promise.all(
    files.map(async (name) => {
      const parsed = referenceSchema.safeParse(await Bun.file(new URL(name, directory)).json())
      if (!parsed.success) throw new Error(`Invalid reference corpus: ${name}`)
      return parsed.data
    })
  )
  const oldCases = groups.flat()
  const ids = new Set(oldCases.map((sample) => sample.post.id))
  const texts = new Set(oldCases.map((sample) => normalized(sample.post.text)))
  const campaigns = new Set(oldCases.map((sample) => sample.group))
  for (const sample of cases) {
    expect(ids.has(sample.post.id)).toBe(false)
    expect(texts.has(normalized(sample.post.text))).toBe(false)
    expect(campaigns.has(sample.group)).toBe(false)
  }
})

test('stage annotations distinguish topic relevance, item evidence and registration completeness', async () => {
  const cases = await readCases()
  for (const sample of cases) {
    for (const item of sample.stageGold.items) {
      for (const evidence of item.evidence) expect(sample.post.text).toContain(evidence)
    }
    if (sample.expected.isEvent === false) {
      expect(sample.stageGold.action).toBe('not_event')
      expect(sample.stageGold.registration).toBe('not_applicable')
      expect(sample.stageGold.items).toEqual([])
      expect(sample.expected).not.toHaveProperty('category')
    }
    if (sample.stageGold.registration === 'ready') {
      expect(sample.stageGold.action).toBe('new')
      for (const key of ['category', 'stores', 'characterIds', 'startDate', 'conditions'])
        expect(sample.expected).toHaveProperty(key)
    }
    if (sample.expected.category !== undefined)
      expect(EventCategorySchema.safeParse(sample.expected.category).success).toBe(true)
    if (sample.expected.stores !== undefined)
      expect(z.array(StoreKeySchema).safeParse(sample.expected.stores).success).toBe(true)
    if (sample.expected.characterIds !== undefined)
      expect(z.array(EventCharacterSchema).safeParse(sample.expected.characterIds).success).toBe(true)
    if (sample.expected.startDate !== undefined)
      expect(z.iso.date().safeParse(sample.expected.startDate).success).toBe(true)
  }
  expect(cases.filter((sample) => sample.stageGold.action === 'update').length).toBeGreaterThan(20)
  expect(cases.filter((sample) => sample.stageGold.action === 'end').length).toBeGreaterThan(10)
  expect(cases.filter((sample) => sample.stageGold.items.length > 1).length).toBeGreaterThan(20)
  expect(
    cases.filter((sample) => sample.stageGold.items.length === 0 && sample.expected.isEvent === true)
  ).toHaveLength(1)
})

test('D1 observations are diagnostic only and the committed provenance needs no live database', async () => {
  const cases = await readCases()
  const rawManifest: unknown = await Bun.file(new URL('goal-provenance.json', directory)).json()
  const manifest = z
    .object({
      datasetRevision: z.literal('goal-pipeline-v1'),
      sourcePostCount: z.number().int().positive(),
      annotationStatus: z.literal('provisional-not-human-reviewed'),
      annotationsSha256: z.string().regex(/^[a-f0-9]{64}$/)
    })
    .safeParse(rawManifest)
  expect(manifest.success).toBe(true)
  if (!manifest.success) throw new Error('Invalid goal corpus provenance')
  expect(manifest.data.sourcePostCount).toBe(236)
  const annotations = cases.map(({ id, expected, stageGold, rationale, tags, group, reviewStatus }) => ({
    id,
    expected,
    stageGold,
    rationale,
    tags,
    group,
    reviewStatus
  }))
  expect(hash(JSON.stringify(canonical(annotations)))).toBe(manifest.data.annotationsSha256)
  expect(cases.filter((sample) => sample.observedD1.job !== null)).toHaveLength(0)
  expect(cases.filter((sample) => sample.observedD1.referencedEvents.length > 0)).toHaveLength(16)
  for (const sample of cases) {
    expect(sample.observedD1.annotationUse).toBe('diagnostic-only-not-gold-not-model-input')
    for (const event of sample.observedD1.referencedEvents) {
      expect(event.url).toContain(`/status/${sample.post.id}`)
    }
  }
})
