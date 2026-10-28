import type { WebhookFailureStage } from '@biccame/shared/domain/webhook-failure'

/**
 * 例外が最初に通った処理の段階。例外そのものは変えずに（クラスも message も stack もそのまま）、例外の同一性で段階だけを覚える。
 * こうすると、NotificationRetry などの instanceof 判定や、既存の例外の扱いを壊さずに段階を付けられる。
 * WeakMap なので例外が捨てられれば一緒に消え、リクエストをまたいで残るものはない。
 */
const stageOfError = new WeakMap<object, WebhookFailureStage>()

/** 例外に段階を付ける。すでに付いていれば何もしない（最も内側の段階が残る）。オブジェクトでない例外には付けられない。 */
export const markWebhookStage = (error: unknown, stage: WebhookFailureStage): void => {
  if (typeof error === 'object' && error !== null && !stageOfError.has(error)) stageOfError.set(error, stage)
}

/** 例外に付いた段階。付いていなければ unknown。 */
export const webhookStageOf = (error: unknown): WebhookFailureStage => {
  if (typeof error !== 'object' || error === null) return 'unknown'
  const stage = stageOfError.get(error)
  return stage === undefined ? 'unknown' : stage
}

/** 処理の区切りを包む。task が投げた例外に段階を付けて、そのまま投げ直す。 */
export const inWebhookStage = async <T>(stage: WebhookFailureStage, task: () => Promise<T>): Promise<T> => {
  try {
    return await task()
  } catch (error) {
    markWebhookStage(error, stage)
    throw error
  }
}
