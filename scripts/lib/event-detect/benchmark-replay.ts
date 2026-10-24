import { ClefRequestSchema, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { buildDetectionDraft, evaluateDetection } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import type { BenchmarkCase } from './benchmark-cases'
import { verifyBenchmarkCheckpoint } from './benchmark-checkpoint'
import { scoreBenchmarkDecision } from './benchmark-score'

const armSchema = z.object({ requests: z.array(ClefRequestSchema).nonempty(), response: ClefResponseSchema })
export const replayBenchmarkResult = (sample: BenchmarkCase, raw: unknown) => {
  verifyBenchmarkCheckpoint(sample, raw)
  const arm = armSchema.safeParse(raw)
  if (!arm.success) throw new Error('Invalid saved benchmark arm')
  const request = {
    ...arm.data.requests[0],
    questions: Object.fromEntries(arm.data.requests.flatMap((batch) => Object.entries(batch.questions)))
  }
  const decision = evaluateDetection(sample.post, request, arm.data.response)
  return scoreBenchmarkDecision(
    sample,
    decision,
    buildDetectionDraft(sample.post, arm.data.response.answers),
    arm.data.response
  )
}
