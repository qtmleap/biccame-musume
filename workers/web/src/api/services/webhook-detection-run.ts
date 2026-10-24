import { detectionConfiguration } from '@api/services/webhook-config'
import { detectionDeadline } from '@api/services/webhook-processing-context'
import type { Bindings } from '@api/types/bindings'
import { type ClefRequest, type ClefResponse, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests, type DetectionThresholds } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'

export type WebhookDetectionConfiguration = Awaited<ReturnType<typeof detectionConfiguration>>

export type WebhookDetectionRun = {
  configuration: WebhookDetectionConfiguration
  /** バッチごとの送信入力（保存する単位） */
  requests: ClefRequest[]
  /** 全バッチの質問をまとめた入力。evaluateDetection に渡す。 */
  request: ClefRequest
  /** 全バッチの回答をまとめた応答 */
  response: ClefResponse
}

/** 現在の設定から、判定（evaluateDetection）と記録（recordWebhookDiscovery）に渡すしきい値を作る。 */
export const detectionThresholds = (configuration: WebhookDetectionConfiguration): DetectionThresholds => ({
  eventThreshold: configuration.eventThreshold,
  fieldThreshold: configuration.choiceThreshold,
  ignoreThreshold: configuration.ignoreThreshold,
  fieldThresholds: configuration.fieldThresholds
})

/**
 * 投稿を Clef に判定させ、全バッチの回答をまとめて返す。DB へは何も書かない。
 * 各送信は64問以下。全バッチが成功するまで、一部の回答だけを返さない（不正・不完全な応答は例外）。
 * beforeBatch は各バッチを送る直前に、そこまでの送信入力を渡して呼ばれる。送信試行の記録は呼び出し側が決める。
 */
export const runWebhookDetection = async (
  env: Bindings,
  post: DetectPost,
  storeKey: string | null,
  beforeBatch: (sent: ClefRequest[]) => Promise<void>
): Promise<WebhookDetectionRun> => {
  const configuration = await detectionConfiguration(env)
  const requests = createDetectionRequests(post, configuration.model, storeKey)
  const responses: ClefResponse[] = []
  for (const [index, request] of requests.entries()) {
    await beforeBatch(requests.slice(0, index + 1))
    const raw: unknown = await detectionDeadline(env.AI.run(`@cf/cloudflare/${configuration.model}`, request))
    const response = ClefResponseSchema.safeParse(raw)
    if (!response.success) throw new Error('Invalid AI response')
    if (
      Object.keys(response.data.answers).some((key) => request.questions[key] === undefined) ||
      Object.entries(request.questions).some(([key, question]) => response.data.answers[key]?.type !== question.type)
    )
      throw new Error('Incomplete detection response')
    responses.push(response.data)
  }
  const request = {
    ...requests[0],
    questions: Object.fromEntries(requests.flatMap((batch) => Object.entries(batch.questions)))
  }
  const response = {
    answers: Object.fromEntries(responses.flatMap((batch) => Object.entries(batch.answers)))
  }
  return { configuration, requests, request, response }
}
