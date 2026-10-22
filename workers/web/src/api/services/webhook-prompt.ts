import type { WebhookTarget } from '@api/services/webhook-jobs'
import type { Bindings } from '@api/types/bindings'
import { type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { webhookPromptDefinition } from '@biccame/shared/event-detect/prompt-definitions'
import {
  type WebhookPrompt,
  type WebhookPromptDefinition,
  WebhookPromptDefinitionSchema
} from '@biccame/shared/schemas/webhook.dto'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

// 実入力の保存形式は応答DTOから分離し、表示情報を履歴へ混ぜない。
const snapshotSchema = z.object({
  questionVersion: z.string().nonempty(),
  requests: z.array(ClefRequestSchema)
})

const storedDefinition = async (
  env: Pick<Bindings, 'DB'>,
  version: string | null
): Promise<WebhookPromptDefinition | null> => {
  if (version === null) return null
  const row = await env.DB.prepare(
    'SELECT definition_json AS definitionJson FROM webhook_prompt_versions WHERE version=?'
  )
    .bind(version)
    .first<{ definitionJson: string }>()
  if (row === null) return null
  const parsed = WebhookPromptDefinitionSchema.safeParse(JSON.parse(row.definitionJson))
  if (!parsed.success || parsed.data.questionVersion !== version) throw new Error('Invalid stored prompt definition')
  return parsed.data
}

/** 同じ版の定義は上書きしない。変更時は必ず版を更新する。 */
export const registerWebhookPromptDefinition = async (env: Pick<Bindings, 'DB'>, version: string): Promise<void> => {
  const definition = webhookPromptDefinition(version)
  if (definition === undefined) return
  await env.DB.prepare(
    'INSERT INTO webhook_prompt_versions (version,definition_json) VALUES (?,?) ON CONFLICT(version) DO NOTHING'
  )
    .bind(version, JSON.stringify(definition))
    .run()
  const saved = await storedDefinition(env, version)
  if (saved === null || JSON.stringify(saved) !== JSON.stringify(definition))
    throw new Error('Webhook prompt definition changed without a version change')
}

/** 呼び出す直前までの送信試行だけを、所有中のリースで保存する。未送信バッチは記録しない。 */
export const saveWebhookPromptAttempt = async (
  env: Pick<Bindings, 'DB'>,
  target: WebhookTarget,
  token: string,
  questionVersion: string,
  requests: ClefRequest[]
): Promise<void> => {
  const prompt = snapshotSchema.safeParse({ questionVersion, requests })
  if (!prompt.success) throw new Error('Invalid webhook prompt snapshot')
  const definition = webhookPromptDefinition(questionVersion)
  if (definition === undefined) throw new Error('Webhook prompt definition is missing for this version')
  for (const request of prompt.data.requests) {
    for (const [key, question] of Object.entries(request.questions)) {
      const template = definition.questions.find((entry) => entry.key === key)
      if (template === undefined || template.type !== question.type || template.instructions !== question.instructions)
        throw new Error('Webhook request does not match its prompt version')
      // 投稿ごとに選択肢が変わる質問は、版定義に固定値ではなく dynamic のプレースホルダだけが載る。
      // 質問ごとに定義から判定するので、店舗のように版によって固定だったり動的だったりする質問も、その版の定義どおりに検査できる。
      const dynamic = Object.keys(template.criteria).length === 1 && Object.hasOwn(template.criteria, 'dynamic')
      if (
        question.type === 'choice' &&
        !dynamic &&
        Object.entries(question.criteria).some(([option, label]) => template.criteria[option] !== label)
      )
        throw new Error('Webhook request criteria do not match its prompt version')
    }
  }
  await registerWebhookPromptDefinition(env, questionVersion)
  const saved = await env.DB.prepare(
    `UPDATE ${target.table} SET requests_json=? WHERE ${target.column}=? AND lease_token=?`
  )
    .bind(JSON.stringify(prompt.data), target.id, token)
    .run()
  if (saved.meta.changes !== 1) throw new Error('Webhook prompt lease lost')
}

/** 管理者向けの遅延取得。候補は必ず投稿IDでも照合し、別投稿の入力を混ぜない。 */
export const getWebhookPrompt = async (
  env: Pick<Bindings, 'DB'>,
  postId: string,
  candidateId?: string
): Promise<WebhookPrompt> => {
  const query =
    candidateId === undefined
      ? env.DB.prepare(
          'SELECT requests_json AS requestsJson,question_version AS questionVersion FROM webhook_event_jobs WHERE post_id=?'
        ).bind(postId)
      : env.DB.prepare(
          'SELECT requests_json AS requestsJson,question_version AS questionVersion FROM webhook_event_candidates WHERE post_id=? AND event_uuid=?'
        ).bind(postId, candidateId)
  const row = await query.first<{ requestsJson: string | null; questionVersion: string | null }>()
  if (row === null) throw new HTTPException(404, { message: 'Webhook prompt not found' })
  if (row.requestsJson === null) {
    const definition = await storedDefinition(env, row.questionVersion)
    return {
      questionVersion: row.questionVersion,
      requests: [],
      source: definition === null ? 'unavailable' : 'definition',
      definition
    }
  }
  const parsed = snapshotSchema.safeParse(JSON.parse(row.requestsJson))
  if (!parsed.success) throw new Error('Invalid stored webhook prompt')
  return {
    ...parsed.data,
    source: 'recorded',
    definition: await storedDefinition(env, parsed.data.questionVersion)
  }
}
