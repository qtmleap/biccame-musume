import { performance } from 'node:perf_hooks'
import { type ClefRequest, type ClefResponse, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { buildDetectionDraft, evaluateDetection } from '@biccame/shared/event-detect/detection'
import type { BenchmarkCase } from './benchmark-cases'
import { benchmarkSignals, scoreBenchmarkDecision } from './benchmark-score'

export type BenchmarkRunner = (request: ClefRequest) => Promise<ClefResponse>

// 再送や並列呼び出しで回数が膨らまないよう、送信単位ごとに一度だけ実行する。
export const runBenchmarkArm = async (sample: BenchmarkCase, requests: ClefRequest[], run: BenchmarkRunner) => {
  if (requests.length === 0) throw new Error('Benchmark requests are empty')
  const start = performance.now()
  const responses: ClefResponse[] = []
  for (const request of requests) {
    const parsed = ClefResponseSchema.safeParse(await run(request))
    if (!parsed.success) throw new Error('Invalid benchmark model response')
    if (
      Object.entries(request.questions).some(([key, question]) => parsed.data.answers[key]?.type !== question.type) ||
      Object.keys(parsed.data.answers).some((key) => request.questions[key] === undefined)
    )
      throw new Error('Incomplete benchmark model response')
    responses.push(parsed.data)
  }
  const request = {
    ...requests[0],
    questions: Object.fromEntries(requests.flatMap((batch) => Object.entries(batch.questions)))
  }
  const response = { answers: Object.fromEntries(responses.flatMap((batch) => Object.entries(batch.answers))) }
  const decision = evaluateDetection(sample.post, request, response)
  return {
    requests,
    response,
    signals: benchmarkSignals(response),
    score: scoreBenchmarkDecision(sample, decision, buildDetectionDraft(sample.post, response.answers), response),
    elapsedMs: Math.round(performance.now() - start)
  }
}

export const runBenchmarkComparison = async (
  sample: BenchmarkCase,
  oldRequests: ClefRequest[],
  newRequests: ClefRequest[],
  run: BenchmarkRunner
) => {
  if (oldRequests.length + newRequests.length > 4) throw new Error('Benchmark comparison exceeds its four-call budget')
  const before = await runBenchmarkArm(sample, oldRequests, run)
  const after = await runBenchmarkArm(sample, newRequests, run)
  return { before, after, calls: oldRequests.length + newRequests.length }
}
