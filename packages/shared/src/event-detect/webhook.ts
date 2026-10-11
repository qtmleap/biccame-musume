import dayjs from 'dayjs'
import { z } from 'zod'
import { DetectPostSchema } from './post'

const TagSchema = z.string().regex(/^tweet-[1-9]\d{0,19}$/)
const UriSchema = z.string().regex(/^\/[A-Za-z0-9_]{1,15}\/status\/[1-9]\d{0,19}$/)
const BodySchema = z.string().nonempty().max(10_000)
const PushPayloadSchema = z.object({
  body: BodySchema.optional(),
  tag: TagSchema.optional(),
  data: z.object({ body: BodySchema, type: z.literal('tweet'), uri: UriSchema, tag: TagSchema })
})

const X_EPOCH = 1_288_834_974_657n
const MAX_SNOWFLAKE = (1n << 64n) - 1n

/** push購読先やiconなどの付随フィールドは検証後の投稿に残さない。 */
export const createWebhookPayloadSchema = (nowMilliseconds?: number) =>
  PushPayloadSchema.transform((payload, ctx): z.input<typeof DetectPostSchema> => {
    const parts = payload.data.uri.split('/')
    const screenName = parts[1]
    const id = parts[3]
    if (
      !screenName ||
      !id ||
      payload.data.tag !== `tweet-${id}` ||
      (payload.tag !== undefined && payload.tag !== payload.data.tag) ||
      (payload.body !== undefined && payload.body !== payload.data.body)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Inconsistent tweet payload' })
      return z.NEVER
    }
    const snowflake = BigInt(id)
    const milliseconds = Number((snowflake >> 22n) + X_EPOCH)
    const now = nowMilliseconds === undefined ? dayjs().valueOf() : nowMilliseconds
    if (snowflake > MAX_SNOWFLAKE || milliseconds < Number(X_EPOCH) || milliseconds > now + 300_000) {
      ctx.addIssue({ code: 'custom', message: 'Invalid tweet timestamp' })
      return z.NEVER
    }
    return {
      id,
      screenName,
      createdAt: dayjs(milliseconds).toISOString(),
      kind: /^RT\s+@/i.test(payload.data.body) ? 'retweet' : 'original',
      text: payload.data.body,
      url: `https://x.com/${screenName}/status/${id}`,
      media: []
    }
  }).pipe(DetectPostSchema)

// 検証結果のdataはDetectPost。元ペイロードは保存対象にしない。
export const WebhookPayloadSchema = createWebhookPayloadSchema()
export const normalizeWebhookPayload = (value: unknown, nowMilliseconds?: number) =>
  createWebhookPayloadSchema(nowMilliseconds).safeParse(value)
