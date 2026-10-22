import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { z } from 'zod'

const directory = new URL('../scripts/data/event-detection-benchmark/', import.meta.url)
const schema = z.array(
  z.object({
    post: z.object({ id: z.string().nonempty(), text: z.string().nonempty() }),
    expected: z.record(z.string().nonempty(), z.unknown()),
    rationale: z.string().nonempty(),
    tags: z.array(z.string().nonempty()),
    stageGold: z.object({
      registration: z.string().nonempty(),
      items: z.array(z.object({ item: z.string().nonempty(), evidence: z.array(z.string().nonempty()) }))
    })
  })
)
const casesOf = async () => {
  const files = (await readdir(directory)).filter((name) => /^goal-\d{3}\.json$/.test(name)).toSorted()
  const groups = await Promise.all(
    files.map(async (name) => {
      const raw: unknown = await Bun.file(new URL(name, directory)).json()
      const parsed = schema.safeParse(raw)
      if (!parsed.success) throw new Error(`Invalid goal corpus: ${name}`)
      return parsed.data
    })
  )
  return groups.flat()
}

test('independent audit fixes cannot regress to the stale curation specification', async () => {
  const cases = await casesOf()
  const nagoya = cases.find((sample) => sample.post.id === '981824942927888387')
  expect(nagoya).toBeDefined()
  expect(nagoya?.rationale).toContain('お誕生会')
  expect(nagoya?.rationale).not.toContain('撮影会を伴う')

  const radius = cases.find((sample) => sample.post.id === '1053194513580093440')
  expect(radius?.stageGold.items).toContainEqual({
    item: '新宿西口たん名刺',
    evidence: ['名刺配布場所☆4階ペンタブレットコーナー(くだりエスカレーターお隣)']
  })
  expect(radius?.tags).not.toContain('zero-giveaway')
  expect(radius?.rationale).not.toContain('物理的な配布物なし')

  const funabashi = cases.find((sample) => sample.post.id === '1682232917504958465')
  expect(funabashi?.rationale).toContain('購入とは書かれず')
  expect(funabashi?.expected).not.toHaveProperty('conditions')
  expect(funabashi?.stageGold.registration).toBe('needs_info')

  const chofu = cases.find((sample) => sample.post.id === '1045844703701168129')
  expect(chofu?.rationale).toContain('開始日は本文にない')
  expect(chofu?.expected).not.toHaveProperty('startDate')
  for (const id of ['981824942927888387', '1053194513580093440', '1682232917504958465', '1045844703701168129']) {
    const sample = cases.find((row) => row.post.id === id)
    expect(sample).toBeDefined()
    if (sample === undefined) throw new Error('Missing independently corrected case')
    for (const item of sample.stageGold.items) {
      for (const evidence of item.evidence) expect(sample.post.text).toContain(evidence)
    }
  }
})

test('provisional event approval does not silently approve unresolved item and action labels', async () => {
  const raw: unknown = await Bun.file(new URL('goal-provenance.json', directory)).json()
  const review = z
    .object({
      stageScoringReview: z.object({
        eventLabels: z.string().nonempty(),
        itemActionLabels: z.string().nonempty(),
        pendingStageScoringExclusionPostIds: z.array(z.string().regex(/^\d+$/)).nonempty(),
        stages: z.object({
          eventRelevanceIsEvent: z.object({
            verdict: z.literal('approved-for-provisional-evaluation'),
            cases: z.literal(236)
          })
        })
      })
    })
    .safeParse(raw)
  expect(review.success).toBe(true)
  if (!review.success) throw new Error('Missing stage-level annotation approval boundary')
  expect(review.data.stageScoringReview.itemActionLabels).toContain('unresolved')
  expect(review.data.stageScoringReview.pendingStageScoringExclusionPostIds).toContain('1227869942122287104')
})
