import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { EventCategorySchema, EventConditionTypeSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const AnnotationSchema = z.object({ isEvent: z.boolean() }).passthrough()
const CorpusSchema = z.array(
  z.object({
    id: z.string().nonempty(),
    source: z.literal('public-post'),
    description: z.string().nonempty(),
    post: DetectPostSchema,
    expected: AnnotationSchema,
    rationale: z.string().nonempty(),
    tags: z.array(z.string().nonempty()).nonempty(),
    group: z.string().nonempty(),
    reviewStatus: z.literal('provisional'),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/)
  })
)
const ConditionSchema = z.object({
  type: EventConditionTypeSchema,
  amount: z.number().int().nonnegative().optional(),
  quantity: z.number().int().positive().optional()
})

const corpus = async () => {
  const files = (await readdir(directory)).filter((file) => /^a-\d{2}\.json$/.test(file)).toSorted()
  const chunks = await Promise.all(
    files.map(async (file) => {
      const text = await Bun.file(new URL(file, directory)).text()
      const raw: unknown = JSON.parse(text)
      const parsed = CorpusSchema.safeParse(raw)
      if (!parsed.success) throw new Error(`Invalid provisional corpus: ${file}`)
      return { file, text, cases: parsed.data }
    })
  )
  return chunks
}

test('A側の実投稿コーパスは80件の重複しない暫定注釈を保持する', async () => {
  const chunks = await corpus()
  const cases = chunks.flatMap((chunk) => chunk.cases)
  expect(cases).toHaveLength(80)
  expect(new Set(cases.map((sample) => sample.id)).size).toBe(cases.length)
  expect(new Set(cases.map((sample) => sample.post.id)).size).toBe(cases.length)
  expect(new Set(cases.map((sample) => sample.sourceHash)).size).toBe(cases.length)
  expect(cases.filter((sample) => sample.expected.isEvent)).toHaveLength(10)
  expect(cases.filter((sample) => !sample.expected.isEvent)).toHaveLength(70)
  for (const chunk of chunks) expect(chunk.text.trimEnd().split('\n').length).toBeLessThan(400)
  for (const sample of cases) {
    expect(sample.id).toBe(`public-${sample.post.id}`)
    expect(sample.post.url).toContain(`/status/${sample.post.id}`)
    expect(sample.reviewStatus).toBe('provisional')
    expect(sample.rationale.length).toBeGreaterThan(10)
  }
})

test('確定した項目だけにカテゴリと条件の注釈を付け、複数配布物に単一カテゴリを強制しない', async () => {
  const cases = (await corpus()).flatMap((chunk) => chunk.cases)
  expect(cases.find((sample) => sample.post.id === '2110681328425521481')?.expected).toMatchObject({
    isEvent: false,
    category: 'acsta'
  })
  expect(cases.find((sample) => sample.post.id === '2109812614091981119')?.expected).toMatchObject({
    isEvent: false,
    category: 'other'
  })
  for (const sample of cases) {
    if ('category' in sample.expected)
      expect(EventCategorySchema.safeParse(sample.expected.category).success).toBe(true)
    if ('startDate' in sample.expected) expect(z.iso.date().safeParse(sample.expected.startDate).success).toBe(true)
    if ('conditions' in sample.expected)
      expect(z.array(ConditionSchema).safeParse(sample.expected.conditions).success).toBe(true)
  }
  const multiple = cases.find((sample) => sample.post.id === '2110185622703087712')
  expect(multiple?.expected).toEqual({ isEvent: true, stores: ['pkan'] })
  const joint = cases.find((sample) => sample.post.id === '2112431117894816142')
  expect(joint?.expected).toMatchObject({
    isEvent: true,
    stores: ['ikenishi', 'itt'],
    characterIds: ['ikenishi', 'itt'],
    conditions: [
      { type: 'purchase', amount: 4000 },
      { type: 'first_come', quantity: 100 }
    ]
  })
})
