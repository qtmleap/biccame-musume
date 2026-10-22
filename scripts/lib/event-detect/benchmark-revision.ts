import { createHash } from 'node:crypto'
import { BOUNDARY_POST_IDS, DEVELOPMENT_POST_IDS } from './benchmark-corpus'
import type { BenchmarkCase } from './benchmark-schema'

// 既存99件を動かさず、未使用・別企画の1件だけを固定seedで補完する。
export const reviseBoundaryHoldout = (original: BenchmarkCase[], corpus: BenchmarkCase[], seed: string) => {
  if (original.length !== 100) throw new Error('Audit repair requires the original 100 cases')
  const removed = original.filter((sample) => BOUNDARY_POST_IDS.has(sample.post.id))
  if (removed.length !== 1) throw new Error('Audit repair must replace exactly one boundary case')
  const retained = original.filter((sample) => !BOUNDARY_POST_IDS.has(sample.post.id))
  const originalIds = new Set(original.map((sample) => sample.post.id))
  const originalGroups = new Set(original.map((sample) => sample.group))
  const developmentGroups = new Set(
    corpus.filter((sample) => DEVELOPMENT_POST_IDS.has(sample.post.id)).map((sample) => sample.group)
  )
  const candidates = corpus
    .filter(
      (sample) =>
        !originalIds.has(sample.post.id) &&
        !originalGroups.has(sample.group) &&
        !DEVELOPMENT_POST_IDS.has(sample.post.id) &&
        !BOUNDARY_POST_IDS.has(sample.post.id) &&
        !developmentGroups.has(sample.group)
    )
    .toSorted((a, b) => {
      const hash = (id: string) => createHash('sha256').update(`${seed}:${id}`).digest('hex')
      return hash(a.id).localeCompare(hash(b.id))
    })
  const positive = candidates.find((sample) => sample.expected.isEvent)
  const added = positive === undefined ? candidates[0] : positive
  if (added === undefined) throw new Error('No unused independent replacement exists')
  return {
    cases: [...retained, added],
    retained,
    removed: removed[0],
    added,
    replacementCandidates: candidates.length,
    seed
  }
}
