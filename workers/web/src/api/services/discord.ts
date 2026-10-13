import {
  type DiscordDeliveryResult,
  type DiscordFailureKind,
  type DiscordStatus,
  type DiscordTestRequest,
  discordTestRequestSchema,
  type EventDetectionNotification,
  eventDetectionNotificationSchema
} from '@biccame/shared/bot'
import dayjs from 'dayjs'
import { z } from 'zod'

export type DiscordBindings = {
  DISCORD_TOKEN?: string
  DISCORD_CHANNEL_ID?: string
  X_POSTING_ENABLED?: string
  DISCORD_POSTING_ENABLED?: string
}

type Transport = (input: string, init: RequestInit) => Promise<Response>
const userSchema = z.object({ id: z.string().regex(/^\d+$/), username: z.string().nonempty().max(200) })
const channelSchema = z.object({ id: z.string().regex(/^\d+$/), name: z.string().nonempty().max(200) })
const messageSchema = z.object({ id: z.string().regex(/^\d+$/) })
const rateLimitSchema = z.object({ retry_after: z.number().positive().max(86400) })

const tokenSchema = z.string().trim().nonempty()
const channelIdSchema = z.string().regex(/^\d+$/)

const settingState = (value: unknown, schema: typeof tokenSchema | typeof channelIdSchema) => {
  if (value === undefined || value === '') return 'missing' as const
  return schema.safeParse(value).success ? ('valid' as const) : ('invalid' as const)
}

const configuration = (env: DiscordBindings) => ({
  token: tokenSchema.safeParse(env.DISCORD_TOKEN).success,
  channel: channelIdSchema.safeParse(env.DISCORD_CHANNEL_ID).success
})

const credentials = (env: DiscordBindings) => {
  const token = tokenSchema.safeParse(env.DISCORD_TOKEN)
  const channelId = channelIdSchema.safeParse(env.DISCORD_CHANNEL_ID)
  if (!token.success || !channelId.success) return undefined
  return { token: token.data, channelId: channelId.data }
}

const failureKind = (status: number): DiscordFailureKind => {
  if (status === 401) return 'authentication'
  if (status === 403) return 'authorization'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'upstream'
  return 'rejected'
}

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

const failedResponse = async (response: Response): Promise<DiscordDeliveryResult> => {
  if (response.status === 429) {
    const parsed = rateLimitSchema.safeParse(await readJson(response))
    return {
      status: 'failed',
      kind: 'rate_limit',
      statusCode: response.status,
      ...(parsed.success ? { retryAfterSeconds: parsed.data.retry_after } : {})
    }
  }
  await response.body?.cancel()
  // 受理後の内部エラーか否かを確認できないため、5xxも無条件には再送しない。
  if (response.status >= 500) return { status: 'unknown', kind: 'delivery_unknown' }
  return { status: 'failed', kind: failureKind(response.status), statusCode: response.status }
}

export const postDiscordMessage = async (
  env: DiscordBindings,
  payload: object,
  transport: Transport = fetch,
  nonce?: string
): Promise<Response | undefined> => {
  const auth = credentials(env)
  if (!auth) return undefined
  try {
    return await transport(`https://discord.com/api/v10/channels/${auth.channelId}/messages`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${auth.token}` },
      body: JSON.stringify({
        ...payload,
        ...(nonce ? { nonce, enforce_nonce: true } : {}),
        allowed_mentions: { parse: [] }
      })
    })
  } catch {
    return undefined
  }
}

const sendMessage = async (
  env: DiscordBindings,
  payload: object,
  requestId: string,
  purpose: 'held' | 'registered' | 'test',
  transport: Transport
): Promise<DiscordDeliveryResult> => {
  const auth = credentials(env)
  if (!auth) return { status: 'failed', kind: 'configuration' }
  // Discordのnonce重複抑止は短時間のみ。永続的な冪等性はapp側の配信履歴で保証する。
  const nonce = `${purpose.slice(0, 1)}${requestId.replaceAll('-', '').slice(0, 24)}`
  const response = await postDiscordMessage(env, payload, transport, nonce)
  if (!response) return { status: 'unknown', kind: 'delivery_unknown' }
  if (!response.ok) return failedResponse(response)
  const parsed = messageSchema.safeParse(await readJson(response))
  // 2xxでもmessage IDが読めなければ、既に送信済みの可能性を残す。
  return parsed.success
    ? { status: 'sent', messageId: parsed.data.id }
    : { status: 'unknown', kind: 'delivery_unknown' }
}

export const buildDetectionNotification = (input: EventDetectionNotification) => ({
  content: input.status === 'registered' ? '配布イベントを自動登録しました。' : '配布イベントの判定を保留しました。',
  embeds: [
    {
      title: input.status === 'registered' ? input.event.title.slice(0, 256) : '配布イベントの確認が必要です',
      url: input.managementUrl,
      color: input.status === 'registered' ? 0x2ecc71 : 0xf1c40f,
      description: input.text.slice(0, 2000),
      fields: [
        { name: '元投稿', value: input.postUrl.slice(0, 512), inline: false },
        ...(input.candidate === undefined
          ? []
          : [
              {
                name: `配布物 ${input.candidate.index}/${input.candidate.total}`,
                value: input.candidate.item,
                inline: false
              }
            ]),
        { name: '判定スコア', value: input.confidence.toFixed(3), inline: true },
        {
          name: '店舗',
          value: (input.stores.length > 0 ? input.stores.join('・') : '未確定').slice(0, 512),
          inline: false
        },
        ...(input.status === 'held'
          ? [
              {
                name: '保留理由',
                value: (input.reasons.length > 0 ? input.reasons.join('\n') : '要確認').slice(0, 512),
                inline: false
              }
            ]
          : [
              { name: '登録イベント', value: input.event.url.slice(0, 512), inline: false },
              {
                name: '開催期間',
                value: `${input.event.startDate}〜${input.event.endDate ? input.event.endDate : '終了日未定'}`.slice(
                  0,
                  1024
                ),
                inline: false
              },
              { name: 'カテゴリ', value: input.event.category, inline: true },
              {
                name: '配布条件',
                value: (input.event.conditions.length > 0 ? input.event.conditions.join('\n') : '未設定').slice(
                  0,
                  1024
                ),
                inline: false
              }
            ])
      ],
      footer: { text: 'Clefのスコアは実際の正解率を保証するものではありません。' }
    }
  ]
})

export const notifyEventDetection = async (
  env: DiscordBindings,
  input: EventDetectionNotification,
  transport: Transport = fetch
): Promise<DiscordDeliveryResult> => {
  const parsed = eventDetectionNotificationSchema.safeParse(input)
  if (!parsed.success) return { status: 'failed', kind: 'invalid_input' }
  return sendMessage(env, buildDetectionNotification(parsed.data), parsed.data.requestId, parsed.data.status, transport)
}

export const testDiscordNotification = async (
  env: DiscordBindings,
  input: DiscordTestRequest,
  transport: Transport = fetch
): Promise<DiscordDeliveryResult> => {
  const parsed = discordTestRequestSchema.safeParse(input)
  if (!parsed.success) return { status: 'failed', kind: 'invalid_input' }
  // 管理者の明示操作でのみ呼ばれる。Xの投稿フラグは変更しない。
  return sendMessage(
    env,
    { content: 'ビッカメ娘: 管理画面からのDiscord接続テストです。' },
    parsed.data.requestId,
    'test',
    transport
  )
}

const statusConnection = (kind: DiscordFailureKind): DiscordStatus['connection'] => {
  if (kind === 'authentication' || kind === 'authorization' || kind === 'rate_limit') return kind
  return 'upstream'
}

const configFingerprint = async (env: DiscordBindings): Promise<string | null> => {
  const auth = credentials(env)
  if (!auth) return null
  const bytes = new TextEncoder().encode(JSON.stringify(['discord-status-v1', auth.token, auth.channelId]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const discordStatus = async (env: DiscordBindings): Promise<DiscordStatus> => ({
  configFingerprint: await configFingerprint(env),
  configured: configuration(env),
  settings: {
    token: settingState(env.DISCORD_TOKEN, tokenSchema),
    channel: settingState(env.DISCORD_CHANNEL_ID, channelIdSchema)
  },
  notificationsEnabled: true,
  xPostingEnabled: env.X_POSTING_ENABLED === 'true',
  discordPostingEnabled: env.DISCORD_POSTING_ENABLED === 'true',
  timelineNotificationsEnabled: false,
  connection: 'unchecked',
  bot: null,
  channel: null,
  sendPermission: 'unknown',
  errorKind: null,
  fetchedAt: dayjs().toISOString()
})

export const checkDiscordConnection = async (
  env: DiscordBindings,
  transport: Transport = fetch
): Promise<DiscordStatus> => {
  const base = await discordStatus(env)
  const auth = credentials(env)
  if (!auth) return { ...base, connection: 'unconfigured', errorKind: 'configuration' }
  const request = async (path: string): Promise<Response | undefined> => {
    try {
      return await transport(`https://discord.com/api/v10${path}`, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bot ${auth.token}` }
      })
    } catch {
      return undefined
    }
  }
  const userResponse = await request('/users/@me')
  if (!userResponse) return { ...base, connection: 'network', errorKind: 'network' }
  if (!userResponse.ok) {
    await userResponse.body?.cancel()
    const kind = failureKind(userResponse.status)
    return { ...base, connection: statusConnection(kind), errorKind: kind }
  }
  const user = userSchema.safeParse(await readJson(userResponse))
  if (!user.success) return { ...base, connection: 'unexpected_response', errorKind: 'unexpected_response' }
  const channelResponse = await request(`/channels/${auth.channelId}`)
  if (!channelResponse) return { ...base, bot: user.data, connection: 'network', errorKind: 'network' }
  if (!channelResponse.ok) {
    await channelResponse.body?.cancel()
    const kind = failureKind(channelResponse.status)
    return { ...base, bot: user.data, connection: statusConnection(kind), errorKind: kind }
  }
  const channel = channelSchema.safeParse(await readJson(channelResponse))
  if (!channel.success || channel.data.id !== auth.channelId)
    return { ...base, bot: user.data, connection: 'unexpected_response', errorKind: 'unexpected_response' }
  // チャンネルを読めることと送信権限は別。送信可否は明示的な送信テストで確認する。
  return { ...base, bot: user.data, channel: channel.data, connection: 'connected' }
}

/** 添付ファイル名。1メッセージ内で重複しないよう、1始まりの連番にする。 */
const attachmentFilename = (index: number): string => `event-${index + 1}.png`

/** 公開告知の画像は1メッセージに全部添付し、画像なし投稿へのフォールバックはしない。 */
export const postDiscordImages = async (
  env: DiscordBindings,
  text: string,
  pngs: Uint8Array[],
  nonce: string,
  transport: Transport = fetch
): Promise<DiscordDeliveryResult> => {
  const auth = credentials(env)
  if (!auth) return { status: 'failed', kind: 'configuration' }
  if (pngs.length === 0) return { status: 'failed', kind: 'invalid_input' }
  const form = new FormData()
  form.append(
    'payload_json',
    JSON.stringify({
      content: text.slice(0, 2000),
      nonce,
      enforce_nonce: true,
      allowed_mentions: { parse: [] },
      attachments: pngs.map((_, index) => ({ id: index, filename: attachmentFilename(index) }))
    })
  )
  pngs.forEach((png, index) => {
    form.append(`files[${index}]`, new Blob([new Uint8Array(png)], { type: 'image/png' }), attachmentFilename(index))
  })
  try {
    const response = await transport(`https://discord.com/api/v10/channels/${auth.channelId}/messages`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bot ${auth.token}` },
      body: form
    })
    if (!response.ok) return failedResponse(response)
    const parsed = messageSchema.safeParse(await readJson(response))
    return parsed.success
      ? { status: 'sent', messageId: parsed.data.id }
      : { status: 'unknown', kind: 'delivery_unknown' }
  } catch {
    return { status: 'unknown', kind: 'delivery_unknown' }
  }
}
