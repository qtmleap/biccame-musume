import type { TitleFetcher } from '@api/services/webhook-title'
import type { Bindings } from '@api/types/bindings'
import {
  type EventExtraction,
  extractionStores,
  extractionSystem,
  extractionTool,
  validateEventExtraction
} from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const MessageSchema = z.object({ content: z.array(z.unknown()) })
const ToolUseSchema = z.object({ type: z.literal('tool_use'), name: z.literal('answer'), input: z.unknown() })

/** 抽出失敗を単一イベントとして扱わない。キューの再試行で復旧し、成功した抽出はDBへ固定する。 */
export const extractWebhookEvents = async (
  env: Bindings,
  post: DetectPost,
  fetcher: TitleFetcher = (url, init) => fetch(url, init)
): Promise<EventExtraction> => {
  const baseUrl = env.ANTHROPIC_BASE_URL
  const token = env.ANTHROPIC_AUTH_TOKEN
  if (!baseUrl || !token) throw new Error('Event extraction is not configured')
  const response = await fetcher(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${token}`,
      'x-api-key': token
    },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: extractionSystem,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            stores: extractionStores(post),
            text: post.text,
            quoted: post.quoted,
            screenName: post.screenName,
            createdAt: post.createdAt
          })
        }
      ],
      tools: [extractionTool],
      tool_choice: { type: 'auto' }
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new Error(`Event extraction HTTP ${response.status}`)
  const message = MessageSchema.safeParse(await response.json())
  if (!message.success) throw new Error('Invalid event extraction response')
  const tools = message.data.content.flatMap((entry) => {
    const tool = ToolUseSchema.safeParse(entry)
    return tool.success ? [tool.data.input] : []
  })
  if (tools.length !== 1) throw new Error('Missing event extraction tool result')
  return validateEventExtraction(post, tools[0])
}
