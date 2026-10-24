import {
  ClefRequestSchema,
  ClefResponseSchema,
  type ClefRequest,
  type ClefResponse
} from '@biccame/shared/event-detect/clef'
import { DEFAULT_ITEM_COUNT_THRESHOLD } from '@biccame/shared/event-detect/extraction'
import { DetectPostSchema, type DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'
import { goalHash, type GoalFetcher, type GoalPipelineModule } from './goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from './goal-pipeline-profile'
import {
  GoalAuditSchema,
  GoalDecisionSchema,
  GoalExtractionSchema,
  GoalOutcomeSchema,
  type GoalPipelineResult,
  type GoalJudgement
} from './goal-pipeline-schema'

type Runner = (request: ClefRequest, stage: 'count' | 'judge') => Promise<ClefResponse>
type Options = { module: GoalPipelineModule; post: DetectPost; run: Runner; extractionFetcher: GoalFetcher }
const inputsSchema = z.array(
  z.object({ item: z.string().nonempty(), stores: z.array(z.string().nonempty()), post: DetectPostSchema })
)

const checkedCall = async (run: Runner, request: ClefRequest, stage: 'count' | 'judge') => {
  const parsed = ClefRequestSchema.safeParse(request)
  if (!parsed.success) throw new Error('Invalid pipeline request')
  const response = ClefResponseSchema.safeParse(await run(parsed.data, stage))
  if (
    !response.success ||
    Object.entries(request.questions).some(([key, question]) => response.data.answers[key]?.type !== question.type) ||
    Object.keys(response.data.answers).some((key) => request.questions[key] === undefined)
  )
    throw new Error('Incomplete pipeline response')
  return response.data
}

// 本番と同じ抽出関数に通信だけを注入し、トークン・実DB・通知へ触れず旧新版を比較する。
export const runGoalPipeline = async ({
  module,
  post,
  run,
  extractionFetcher
}: Options): Promise<GoalPipelineResult> => {
  const calls = { count: 0 }
  const call: Runner = async (request, stage) => {
    calls.count += 1
    return await run(request, stage)
  }
  const extract = async () => {
    const raw = await module.extractWebhookEvents(
      { ANTHROPIC_BASE_URL: 'https://benchmark.invalid', ANTHROPIC_AUTH_TOKEN: 'not-a-credential' },
      post,
      async (url, init) => {
        calls.count += 1
        return await extractionFetcher(url, init)
      }
    )
    const parsed = GoalExtractionSchema.safeParse(module.validateEventExtraction(post, raw))
    if (!parsed.success) throw new Error('Invalid pipeline extraction')
    return parsed.data
  }
  const countRequest = module.createItemCountRequest(post, GOAL_PIPELINE_PROFILE.model)
  const countResponse = await checkedCall(call, countRequest, 'count')
  const first = await extract()
  const firstAudit = GoalAuditSchema.safeParse(
    module.auditItemCount(first.events, countResponse, DEFAULT_ITEM_COUNT_THRESHOLD)
  )
  if (!firstAudit.success) throw new Error('Invalid first item count audit')
  const extraction = firstAudit.data.status === 'mismatch' ? await extract() : first
  const audit = GoalAuditSchema.safeParse(
    module.auditItemCount(extraction.events, countResponse, DEFAULT_ITEM_COUNT_THRESHOLD)
  )
  if (!audit.success) throw new Error('Invalid item count audit')
  const retaining = module.extractionCandidateInputs !== undefined
  const stopped = !retaining && audit.data.status !== 'matched'
  const stopReasons = audit.data.status === 'matched' ? [] : [`distribution_item_count_${audit.data.status}`]
  const inputRaw =
    retaining && module.extractionCandidateInputs !== undefined
      ? module.extractionCandidateInputs(post, extraction)
      : extraction.events.map((event) => ({
          item: event.item,
          stores: event.stores,
          post: module.extractedPost(post, event)
        }))
  const inputs = inputsSchema.safeParse(inputRaw)
  if (!inputs.success) throw new Error('Invalid focused candidate inputs')
  const judgements: GoalJudgement[] = []
  if (!stopped) {
    for (const input of inputs.data) {
      // 同名物品や並べ替えでも別候補の店舗を借りず、本番保存と同じ候補自身の値を使う。
      const storeKey = input.stores.length === 1 ? input.stores[0] : null
      const requests = z
        .array(ClefRequestSchema)
        .nonempty()
        .safeParse(module.createDetectionRequests(input.post, GOAL_PIPELINE_PROFILE.model, storeKey))
      if (!requests.success) throw new Error('Invalid detection batches')
      const responses: ClefResponse[] = []
      for (const request of requests.data) responses.push(await checkedCall(call, request, 'judge'))
      const request = {
        ...requests.data[0],
        questions: Object.fromEntries(requests.data.flatMap((batch) => Object.entries(batch.questions)))
      }
      const response = { answers: Object.fromEntries(responses.flatMap((batch) => Object.entries(batch.answers))) }
      const decision = GoalDecisionSchema.safeParse(
        module.evaluateDetection(input.post, request, response, GOAL_PIPELINE_PROFILE.thresholds, storeKey)
      )
      const draft = z
        .record(z.string().nonempty(), z.unknown())
        .safeParse(module.buildDetectionDraft(input.post, response.answers))
      if (!decision.success || !draft.success) throw new Error('Invalid focused pipeline decision')
      const outcome =
        module.describeDetectionOutcome === undefined
          ? null
          : GoalOutcomeSchema.safeParse(
              module.describeDetectionOutcome(
                input.post,
                response.answers,
                decision.data,
                GOAL_PIPELINE_PROFILE.thresholds
              )
            )
      const grounded = z
        .array(z.string().nonempty())
        .safeParse(module.groundedDiscoveryEvidence === undefined ? [] : module.groundedDiscoveryEvidence(input.post))
      if ((outcome !== null && !outcome.success) || !grounded.success) throw new Error('Invalid discovery outcome')
      judgements.push({
        item: input.item,
        post: input.post,
        requests: requests.data,
        response,
        decision: decision.data,
        draft: draft.data,
        outcome: outcome === null ? null : outcome.data,
        groundedEvidence: grounded.data,
        contextOnly: input.post.extractionContext?.kind === 'event'
      })
    }
  }
  return {
    version: module.DETECTION_VERSION,
    extractionVersion: module.EXTRACTION_VERSION,
    inputHash: goalHash(post),
    post,
    extraction,
    audit: audit.data,
    countRequest,
    countResponse,
    judgements,
    stopped,
    stopReasons,
    calls: calls.count
  }
}
