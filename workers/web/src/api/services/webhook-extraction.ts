import type { TitleFetcher } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import {
  type EventExtraction,
  EventExtractionValidationError,
  extractionCharacters,
  extractionStores,
  extractionSystem,
  extractionTool,
  validateEventExtraction
} from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const MessageSchema = z.object({ content: z.array(z.unknown()) })
const ToolUseSchema = z.object({ type: z.literal('tool_use'), name: z.literal('answer'), input: z.unknown() })
const AnyToolUseSchema = z.object({ type: z.literal('tool_use') })
type ExtractionFailureCode =
  | 'extraction_not_configured'
  | 'extraction_timeout'
  | 'extraction_network_error'
  | 'extraction_invalid_response'
  | 'extraction_missing_tool_result'
  | `extraction_http_${number}`

/** 接続先・本文・トークンや生の例外を保存しない、抽出通信の失敗理由。 */
export class WebhookExtractionError extends Error {
  readonly code: ExtractionFailureCode
  constructor(code: ExtractionFailureCode) {
    super(code)
    this.code = code
  }
}

export const webhookProcessingErrorCode = (error: unknown): string =>
  error instanceof WebhookExtractionError || error instanceof EventExtractionValidationError
    ? error.code
    : 'processing_failed'

const transportFailure = (error: unknown, signal: AbortSignal) =>
  new WebhookExtractionError(
    signal.aborted || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
      ? 'extraction_timeout'
      : 'extraction_network_error'
  )

/** 抽出失敗を単一イベントとして扱わない。ツール未呼び出しだけ1回追加し、成功した抽出はDBへ固定する。 */
export const extractWebhookEvents = async (
  env: Pick<Bindings, 'ANTHROPIC_BASE_URL' | 'ANTHROPIC_AUTH_TOKEN'>,
  post: DetectPost,
  fetcher: TitleFetcher = (url, init) => fetch(url, init)
): Promise<EventExtraction> => {
  const baseUrl = env.ANTHROPIC_BASE_URL
  const token = env.ANTHROPIC_AUTH_TOKEN
  if (!baseUrl || !token) throw new WebhookExtractionError('extraction_not_configured')
  const body = JSON.stringify({
    model: 'claude-haiku-5-5',
    max_tokens: 4096,
    system: extractionSystem,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          stores: extractionStores(post),
          characters: extractionCharacters(),
          text: post.text,
          quoted: post.quoted,
          screenName: post.screenName,
          createdAt: post.createdAt
        })
      }
    ],
    tools: [extractionTool],
    tool_choice: { type: 'auto' }
  })
  for (const attempt of [0, 1]) {
    const signal = AbortSignal.timeout(30_000)
    const response = await (async () => {
      try {
        return await fetcher(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            Authorization: `Bearer ${token}`,
            'x-api-key': token
          },
          body,
          signal
        })
      } catch (error) {
        throw transportFailure(error, signal)
      }
    })()
    if (!response.ok) throw new WebhookExtractionError(`extraction_http_${response.status}`)
    const raw = await (async () => {
      try {
        return await response.json()
      } catch (error) {
        if (error instanceof SyntaxError) throw new WebhookExtractionError('extraction_invalid_response')
        throw transportFailure(error, signal)
      }
    })()
    const message = MessageSchema.safeParse(raw)
    if (!message.success) throw new WebhookExtractionError('extraction_invalid_response')
    const tools = message.data.content.flatMap((entry) => {
      const tool = ToolUseSchema.safeParse(entry)
      return tool.success ? [tool.data.input] : []
    })
    const toolCalls = message.data.content.filter((entry) => AnyToolUseSchema.safeParse(entry).success)
    if (toolCalls.length === 0) {
      if (attempt === 0) continue
      throw new WebhookExtractionError('extraction_missing_tool_result')
    }
    if (tools.length !== 1 || toolCalls.length !== 1) throw new WebhookExtractionError('extraction_invalid_response')
    return validateEventExtraction(post, tools[0])
  }
  throw new WebhookExtractionError('extraction_missing_tool_result')
}
