import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { ClefResponseSchema } from '@biccame/shared/event-detect/clef'
import { z } from 'zod'
import type { GoalFetcher } from './goal-pipeline-module'
import { describeGoalTransportError, type GoalModelStage, GoalTransportError } from './goal-transport-error'

const localEndpoint = (value: string, expectedPath: string) => {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== expectedPath ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== ''
  )
    throw new Error('Only the existing local evaluation endpoint is allowed')
  return url
}

export const createGoalModelClient = (options: {
  decideEndpoint: string
  extractionEndpoint: string
  beforeCall: (stage: string, input: unknown) => Promise<void>
  afterCall: (stage: string, response: unknown) => Promise<void>
}) => {
  const decide = localEndpoint(options.decideEndpoint, '/api/admin/event-detect/decide')
  const extraction = localEndpoint(options.extractionEndpoint, '/api/admin/event-detect/extract-evaluate')
  const send = async (url: URL, body: unknown, stage: GoalModelStage) => {
    await options.beforeCall(stage, body)
    const requestId = crypto.randomUUID()
    const signal = AbortSignal.timeout(120_000)
    const startedAt = performance.now()
    const response = await (async () => {
      try {
        return await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Connection: 'close', 'X-Event-Detect-Request-Id': requestId },
          body: JSON.stringify(body),
          signal
        })
      } catch (error) {
        throw new GoalTransportError(
          describeGoalTransportError(error, signal, stage, performance.now() - startedAt, requestId)
        )
      }
    })()
    if (!response.ok) throw new Error(`Evaluation endpoint returned HTTP ${response.status}; requestId=${requestId}`)
    const raw: unknown = await (async () => {
      try {
        return await response.clone().json()
      } catch {
        throw new Error(`Invalid evaluation JSON response; requestId=${requestId}`)
      }
    })()
    await options.afterCall(stage, raw)
    return response
  }
  return {
    run: async (request: ClefRequest, stage: 'count' | 'judge') => {
      const raw: unknown = await (await send(decide, request, stage)).json()
      const result = ClefResponseSchema.safeParse(raw)
      if (!result.success) throw new Error('Invalid Clef evaluation response')
      return result.data
    },
    extractionFetcher: (async (_url, init) => {
      if (typeof init.body !== 'string') throw new Error('Missing extraction request body')
      const raw: unknown = JSON.parse(init.body)
      const parsed = z
        .object({
          model: z.literal('claude-haiku-5-5'),
          system: z.string().nonempty(),
          messages: z.array(z.unknown()),
          tools: z.array(z.unknown()),
          tool_choice: z.unknown(),
          max_tokens: z.number()
        })
        .safeParse(raw)
      if (!parsed.success) throw new Error('Invalid extraction request body')
      return await send(extraction, parsed.data, 'extract')
    }) satisfies GoalFetcher
  }
}
