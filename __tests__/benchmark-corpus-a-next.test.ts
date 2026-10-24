import { expect, test } from 'bun:test'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import annotations from '../scripts/data/event-detection-benchmark-next/a-annotation-updates.json'
import candidates from '../scripts/data/event-detection-benchmark-next/a-positive-candidates.json'

test('次revision候補は現行manifestに混ぜず、明瞭な独立陽性1件だけを数える', () => {
  expect(candidates.revision).toBe('next')
  expect(candidates.activeManifestChanged).toBe(false)
  expect(candidates.candidateCases).toHaveLength(1)
  const sample = candidates.candidateCases[0]
  expect(DetectPostSchema.safeParse(sample.post).success).toBe(true)
  expect(sample.expected).toEqual({
    isEvent: true,
    category: 'other',
    stores: ['hachioji'],
    characterIds: ['hachioji', 'machida']
  })
  expect(sample.annotationDetails.limitedQuantityPerDesign).toBe(250)
  expect(sample.annotationDetails.remainingApproximate).toEqual({ hachioji: 107, machida: 116 })
  expect(sample.expected).not.toHaveProperty('conditions')
  expect(candidates.notCountedCandidates).toHaveLength(1)
  expect(candidates.notCountedCandidates[0].reviewStatus).toBe('needs-review')
})

test('明示購入条件と物品別残数を根拠付きで別々に保持する', () => {
  expect(annotations.activeManifestChanged).toBe(false)
  const coaster = annotations.updates.find((sample) => sample.id === 'public-2109841560305361272')
  expect(coaster?.expectedAlreadyAnnotated?.conditions).toEqual([{ type: 'purchase', amount: 5000 }])
  expect(coaster?.annotationDetails?.limitedQuantity).toBe(60)
  const acsta = annotations.updates.find((sample) => sample.id === 'public-2112431117894816142')
  expect(acsta?.expectedAlreadyAnnotated?.conditions).toEqual([
    { type: 'purchase', amount: 4000 },
    { type: 'first_come', quantity: 100 }
  ])
  const multiple = annotations.updates.find((sample) => sample.id === 'public-2110185622703087712')
  expect(multiple?.annotationDetails?.quantityRole).toBe('remaining-not-total-limit')
  expect(multiple?.annotationDetails?.items).toHaveLength(3)
})
