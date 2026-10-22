import { createHash } from 'node:crypto'
import { ClefModelSchema, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import type { BenchmarkCase } from './benchmark-cases'

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    )
  return value
}
export const benchmarkRequestHash = (requests: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(requests)))
    .digest('hex')

// モデル・本文・質問・選択肢が一致する応答だけを再利用する。
export const verifyBenchmarkCheckpoint = (sample: BenchmarkCase, raw: unknown) => {
  const parsed = z
    .object({
      requests: z.array(ClefRequestSchema).nonempty(),
      requestHash: z.string().nonempty().optional(),
      model: ClefModelSchema.optional()
    })
    .safeParse(raw)
  if (!parsed.success) throw new Error(`Invalid checkpoint requests: ${sample.id}`)
  const expected = createDetectionRequests(sample.post)
  const actualHash = benchmarkRequestHash(parsed.data.requests)
  const expectedHash = benchmarkRequestHash(expected)
  if (
    (parsed.data.model !== undefined && parsed.data.model !== expected[0].model) ||
    parsed.data.requests.some((request, index) => request.model !== expected[index]?.model)
  )
    throw new Error(`Checkpoint model mismatch: ${sample.id}`)
  if (actualHash !== expectedHash || (parsed.data.requestHash !== undefined && parsed.data.requestHash !== actualHash))
    throw new Error(`Checkpoint request hash mismatch: ${sample.id}`)
  return { requestHash: actualHash, model: expected[0].model }
}
