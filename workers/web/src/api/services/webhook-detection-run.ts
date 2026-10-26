import { detectionConfiguration } from '@api/services/webhook-config'
import { detectionDeadline } from '@api/services/webhook-processing-context'
import type { Bindings } from '@api/types/bindings'
import { CHARACTER_QUESTION_KEY, STORE_QUESTION_KEY } from '@biccame/shared/event-detect/associations'
import { type ClefRequest, type ClefResponse, ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import {
  confirmTargetOf,
  createConfirmRequest,
  createDetectionRequests,
  type DetectionThresholds,
  hasConfirmTarget,
  thresholdOf
} from '@biccame/shared/event-detect/detection'
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

/** 1回の送信。AI を呼び、応答が質問と過不足なく対応していることを確かめる。不正・不完全な応答は例外にする。 */
const sendRequest = async (
  env: Bindings,
  model: WebhookDetectionConfiguration['model'],
  request: ClefRequest
): Promise<ClefResponse> => {
  const raw: unknown = await detectionDeadline(env.AI.run(`@cf/cloudflare/${model}`, request))
  const response = ClefResponseSchema.safeParse(raw)
  if (!response.success) throw new Error('Invalid AI response')
  if (
    Object.keys(response.data.answers).some((key) => request.questions[key] === undefined) ||
    Object.entries(request.questions).some(([key, question]) => response.data.answers[key]?.type !== question.type)
  )
    throw new Error('Incomplete detection response')
  return response.data
}

/**
 * 投稿を Clef に判定させ、全バッチの回答をまとめて返す。DB へは何も書かない。
 * 1段目は各送信が64問以下。全バッチが成功してから、2段目として、最上位に選ばれた具体的な店舗・娘のうち最上位の確率が下限（既定 70%）未満のものを
 * 「この店舗ですか」「このビッカメ娘ですか」とはい/いいえで確認する質問を、1リクエストにまとめて1回送る（対象が無ければ2段目は送らず、質問も作らない）。
 * 最上位の娘が店舗の娘（最上位の店舗と同じ ID）でも、具体的な娘で下限未満なら娘も聞く（店舗と娘は二回チェックする）。
 * まとめた request / response には確認の質問と回答（store_confirm・character_confirm）も含める。
 * 全バッチと2段目が成功するまで、一部の回答だけを返さない（不正・不完全な応答は例外）。
 * beforeBatch は各バッチ（2段目を含む）を送る直前に、そこまでの送信入力を渡して呼ばれる。送信試行の記録は呼び出し側が決める。
 */
export const runWebhookDetection = async (
  env: Bindings,
  post: DetectPost,
  storeKey: string | null,
  beforeBatch: (sent: ClefRequest[]) => Promise<void>
): Promise<WebhookDetectionRun> => {
  const configuration = await detectionConfiguration(env)
  const firstRequests = createDetectionRequests(post, configuration.model, storeKey)
  const firstResponses: ClefResponse[] = []
  for (const [index, request] of firstRequests.entries()) {
    await beforeBatch(firstRequests.slice(0, index + 1))
    firstResponses.push(await sendRequest(env, configuration.model, request))
  }
  const firstAnswers = Object.fromEntries(firstResponses.flatMap((batch) => Object.entries(batch.answers)))
  // 2段目の対象は、1段目の choice の最上位が具体的な店舗・娘で、かつ最上位の確率が下限（store・character のしきい値。既定 70%）未満のもの。
  // 下限以上は確認なしで確定するので聞かない。下限は判定（evaluateDetection）と同じ thresholdOf で引く。店舗の娘も、具体的な娘なら娘の対象にする。
  // 1段目の応答が出そろってから作る。
  const thresholds = detectionThresholds(configuration)
  const target = confirmTargetOf(firstAnswers, {
    store: thresholdOf(thresholds, STORE_QUESTION_KEY),
    character: thresholdOf(thresholds, CHARACTER_QUESTION_KEY)
  })
  const confirmRequests = hasConfirmTarget(target) ? [createConfirmRequest(firstRequests[0], target)] : []
  const confirmResponses: ClefResponse[] = []
  for (const [index, request] of confirmRequests.entries()) {
    await beforeBatch([...firstRequests, ...confirmRequests.slice(0, index + 1)])
    confirmResponses.push(await sendRequest(env, configuration.model, request))
  }
  const requests = [...firstRequests, ...confirmRequests]
  const request = {
    ...requests[0],
    questions: Object.fromEntries(requests.flatMap((batch) => Object.entries(batch.questions)))
  }
  const response = {
    answers: Object.fromEntries(
      [...firstResponses, ...confirmResponses].flatMap((batch) => Object.entries(batch.answers))
    )
  }
  return { configuration, requests, request, response }
}
