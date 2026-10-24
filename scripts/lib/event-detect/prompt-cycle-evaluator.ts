import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  type ClefModel,
  type ClefRequest,
  ClefRequestSchema,
  type ClefResponse
} from '@biccame/shared/event-detect/clef'
import { DetectionDraftSchema, DetectionResultSchema } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

export const promptCycleHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const functions = z.object({
  DETECTION_VERSION: z.string().nonempty(),
  DEFAULT_DETECTION_THRESHOLDS: z.object({
    eventThreshold: z.number(),
    fieldThreshold: z.number(),
    ignoreThreshold: z.number()
  }),
  createDetectionRequests: z.custom<(post: DetectPost, model?: ClefModel) => unknown>(
    (value) => typeof value === 'function'
  ),
  evaluateDetection: z.custom<(post: DetectPost, request: ClefRequest, response: ClefResponse) => unknown>(
    (value) => typeof value === 'function'
  ),
  buildDetectionDraft: z.custom<(post: DetectPost, answers: ClefResponse['answers']) => unknown>(
    (value) => typeof value === 'function'
  )
})

// 内部依存を固定したbundle以外は読み込まず、入力・出力も毎回検証する。
export const loadPromptCycleEvaluator = async (file: string) => {
  if (!file.endsWith('.mjs')) throw new Error('Cycle evaluator must be a frozen module bundle')
  const source = await Bun.file(file).arrayBuffer()
  const sha256 = createHash('sha256').update(Buffer.from(source)).digest('hex')
  const metadata = z
    .object({
      version: z.string().nonempty(),
      sha256: z.string().nonempty(),
      externalDependencies: z.object({ zod: z.string().nonempty(), dayjs: z.string().nonempty() })
    })
    .safeParse(await Bun.file(`${file.slice(0, -4)}.meta.json`).json())
  if (!metadata.success || metadata.data.sha256 !== sha256)
    throw new Error('Frozen evaluator hash does not match metadata')
  for (const name of ['zod', 'dayjs'] as const) {
    const dependency = z
      .object({ version: z.string().nonempty() })
      .safeParse(await Bun.file(Bun.resolveSync(`${name}/package.json`, process.cwd())).json())
    if (!dependency.success || dependency.data.version !== metadata.data.externalDependencies[name])
      throw new Error('Frozen evaluator dependency version changed')
  }
  const raw: unknown = await import(pathToFileURL(file).href)
  const parsed = functions.safeParse(raw)
  if (!parsed.success) throw new Error('Invalid frozen evaluator exports')
  const evaluator = parsed.data
  if (evaluator.DETECTION_VERSION !== metadata.data.version)
    throw new Error('Frozen evaluator version does not match metadata')
  const requests = (post: DetectPost, model: ClefModel = 'clef') => {
    const result = z.array(ClefRequestSchema).nonempty().safeParse(evaluator.createDetectionRequests(post, model))
    if (!result.success) throw new Error('Invalid frozen evaluator requests')
    return result.data
  }
  const evaluate = (post: DetectPost, batches: ClefRequest[], response: ClefResponse) => {
    const first = batches[0]
    if (first === undefined) throw new Error('Missing evaluator batch')
    const request = {
      ...first,
      questions: Object.fromEntries(batches.flatMap((batch) => Object.entries(batch.questions)))
    }
    const decision = DetectionResultSchema.safeParse(evaluator.evaluateDetection(post, request, response))
    const draft = DetectionDraftSchema.safeParse(evaluator.buildDetectionDraft(post, response.answers))
    if (!decision.success || !draft.success) throw new Error('Invalid frozen evaluator decision')
    return { decision: decision.data, draft: draft.data }
  }
  return {
    version: evaluator.DETECTION_VERSION,
    sha256,
    thresholds: evaluator.DEFAULT_DETECTION_THRESHOLDS,
    requests,
    evaluate
  }
}
export type PromptCycleEvaluator = Awaited<ReturnType<typeof loadPromptCycleEvaluator>>
