import {
  type AccountResult,
  type AppBotReadRpc,
  accountResultSchema,
  announcementSchema,
  type DeliveryResult,
  dailyRequestSchema,
  dailyTargetsResultSchema,
  deliveryResultSchema,
  type PostingSessionResult,
  postingSessionResultSchema
} from '@biccame/shared/bot'
import { z } from 'zod'

export type PostingTransport = {
  checkAuthenticatedSession(): Promise<void>
  tweet(text: string, options?: { quoteTweetId?: string; replyToTweetId?: string }): Promise<string>
  getOwnAccount(): Promise<unknown>
}
export type PostingFlags = { X_POSTING_ENABLED?: string; X_ACCOUNT_READ_ENABLED?: string }
const failureSchema = z.object({
  kind: z.enum([
    'configuration',
    'missing_credentials',
    'delivery_unknown',
    'signature',
    'authentication',
    'account_mismatch',
    'rate_limit',
    'rejected',
    'unexpected_response',
    'network'
  ]),
  delivery: z.enum(['failed', 'unknown']).optional()
})
const safeDeliveryFailure = (error: unknown): DeliveryResult => {
  const parsed = failureSchema.safeParse(error)
  if (!parsed.success) return { status: 'unknown', kind: 'network' }
  if (parsed.data.kind === 'missing_credentials') return { status: 'failed', kind: 'configuration' }
  const fallback = ['network', 'unexpected_response', 'delivery_unknown'].includes(parsed.data.kind)
    ? 'unknown'
    : 'failed'
  return { status: parsed.data.delivery ? parsed.data.delivery : fallback, kind: parsed.data.kind }
}

export const postAnnouncement = async (
  env: PostingFlags,
  input: unknown,
  transport: PostingTransport
): Promise<DeliveryResult> => {
  const parsed = announcementSchema.safeParse(input)
  if (!parsed.success) return { status: 'failed', kind: 'configuration' }
  if (env.X_POSTING_ENABLED !== 'true') return { status: 'disabled' }
  // TL用と投稿用の認証主体が同じと仮定しない。投稿前に期待する主体を確認する。
  try {
    await transport.checkAuthenticatedSession()
  } catch (error) {
    const health = z
      .object({
        kind: z.enum([
          'missing_credentials',
          'authentication',
          'account_mismatch',
          'authorization',
          'upstream',
          'signature',
          'rate_limit',
          'network',
          'unexpected_response'
        ])
      })
      .safeParse(error)
    if (!health.success) return { status: 'failed', kind: 'unexpected_response' }
    return { status: 'failed', kind: health.data.kind === 'missing_credentials' ? 'configuration' : health.data.kind }
  }
  try {
    const tweetId = await transport.tweet(parsed.data.text, { quoteTweetId: parsed.data.quoteTweetId })
    const response = deliveryResultSchema.safeParse({ status: 'sent', tweetId })
    return response.success ? response.data : { status: 'unknown', kind: 'unexpected_response' }
  } catch (error) {
    return safeDeliveryFailure(error)
  }
}

export const readBotAccount = async (env: PostingFlags, transport: PostingTransport): Promise<AccountResult> => {
  if (env.X_ACCOUNT_READ_ENABLED !== 'true') return { ok: false, kind: 'disabled' }
  try {
    // 公開プロフィール確認であり、認証主体確認の成功とは扱わない。
    const parsed = accountResultSchema.safeParse({ ok: true, account: await transport.getOwnAccount() })
    return parsed.success ? parsed.data : { ok: false, kind: 'unexpected_response' }
  } catch {
    return { ok: false, kind: 'unexpected_response' }
  }
}

export const verifyPostingSession = async (
  env: PostingFlags,
  transport: PostingTransport
): Promise<PostingSessionResult> => {
  if (env.X_ACCOUNT_READ_ENABLED !== 'true') return { ok: false, kind: 'disabled' }
  try {
    await transport.checkAuthenticatedSession()
    return { ok: true }
  } catch (error) {
    const kind = z.object({ kind: z.string().nonempty() }).safeParse(error)
    const parsed = postingSessionResultSchema.safeParse({
      ok: false,
      kind:
        kind.success && kind.data.kind === 'missing_credentials'
          ? 'configuration'
          : kind.success
            ? kind.data.kind
            : 'unexpected_response'
    })
    return parsed.success ? parsed.data : { ok: false, kind: 'unexpected_response' }
  }
}

type DailyOptions = {
  app?: AppBotReadRpc
  notifyHealthFailure: (error: unknown, scheduledAt: string) => Promise<void>
}

export const runBotDaily = async (
  env: PostingFlags,
  scheduledAt: string,
  transport: PostingTransport,
  options: DailyOptions
): Promise<void> => {
  if (env.X_POSTING_ENABLED !== 'true') return
  const request = dailyRequestSchema.safeParse({ scheduledAt })
  if (!request.success) {
    console.error('bot daily: invalid scheduled time')
    return
  }
  try {
    await transport.checkAuthenticatedSession()
  } catch (error) {
    try {
      await options.notifyHealthFailure(error, scheduledAt)
    } catch {
      console.error('bot daily: health notification failed')
    }
    console.error('bot daily: health failed; posts skipped')
    return
  }
  if (!options.app) {
    console.error('bot daily: app binding unavailable')
    return
  }
  let result: unknown
  try {
    result = await options.app.dailyTargets(request.data)
  } catch {
    console.error('bot daily: app RPC unavailable')
    return
  }
  const parsed = dailyTargetsResultSchema.safeParse(result)
  if (!parsed.success || !parsed.data.ok || parsed.data.targets.scheduledAt !== scheduledAt) {
    console.error('bot daily: invalid or unavailable targets')
    return
  }
  const thread = async (texts: string[], purpose: 'starting' | 'ending') => {
    let replyToTweetId: string | undefined
    for (const text of texts) {
      try {
        const tweetId = await transport.tweet(text, { replyToTweetId })
        const sent = deliveryResultSchema.safeParse({ status: 'sent', tweetId })
        if (!sent.success || sent.data.status !== 'sent') {
          console.error('bot daily: thread stopped', { purpose, status: 'unknown' })
          return
        }
        replyToTweetId = sent.data.tweetId
      } catch (error) {
        const failure = safeDeliveryFailure(error)
        console.error('bot daily: thread stopped', { purpose, status: failure.status })
        return
      }
    }
  }
  await Promise.all([
    thread(parsed.data.targets.starting.texts, 'starting'),
    thread(parsed.data.targets.ending.texts, 'ending')
  ])
}
