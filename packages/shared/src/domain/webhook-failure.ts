/**
 * 処理の失敗理由（last_error）のうち、抽出系の固有コード（extraction_*）以外の例外の形式。
 *   processing_failed:<段階>:<例外名>
 * 接続先・本文・トークンや生の例外を保存しない方針のため、残すのは固定の段階名と、サニタイズした例外名だけ。
 * 例外のメッセージ・スタックは、保存もログも禁止。サーバー（webhook-failure-stage.ts）が作り、画面（webhook-labels.ts）が読む。
 */
export const WEBHOOK_FAILURE_STAGES = [
  'claim',
  'job',
  'item_count',
  'extraction',
  'extraction_save',
  'candidate',
  'detection',
  'prompt_save',
  'linked_event',
  'title',
  'registration',
  'discovery',
  'notification',
  'aggregate',
  'unknown'
] as const

export type WebhookFailureStage = (typeof WEBHOOK_FAILURE_STAGES)[number]

export const WEBHOOK_FAILURE_PREFIX = 'processing_failed'

/** 例外名として残してよい形。収まらない名前は FALLBACK_EXCEPTION_NAME にする。 */
const EXCEPTION_NAME_PATTERN = /^[A-Za-z0-9_.$-]{1,60}$/

export const FALLBACK_EXCEPTION_NAME = 'Error'

/** 例外のクラス名（Error.name）。Error 以外の値や、形が合わない名前は Error にする。メッセージには触れない。 */
export const webhookExceptionName = (error: unknown): string => {
  if (!(error instanceof Error) || typeof error.name !== 'string') return FALLBACK_EXCEPTION_NAME
  return EXCEPTION_NAME_PATTERN.test(error.name) ? error.name : FALLBACK_EXCEPTION_NAME
}

export const webhookFailureCode = (stage: WebhookFailureStage, exceptionName: string): string =>
  `${WEBHOOK_FAILURE_PREFIX}:${stage}:${exceptionName}`

const FAILURE_CODE_PATTERN = /^processing_failed:([a-z_]+):([A-Za-z0-9_.$-]{1,60})$/

/** last_error が processing_failed:<段階>:<例外名> の形なら、段階と例外名を返す。段階が未知、または形が合わないときは null。 */
export const parseWebhookFailureCode = (
  lastError: string
): { stage: WebhookFailureStage; exceptionName: string } | null => {
  const matched = FAILURE_CODE_PATTERN.exec(lastError)
  if (matched === null) return null
  const stage = WEBHOOK_FAILURE_STAGES.find((candidate) => candidate === matched[1])
  return stage === undefined ? null : { stage, exceptionName: matched[2] }
}
