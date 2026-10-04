import OpenAI from 'openai'
import { z } from 'zod'
import type { Bindings } from './bindings'
import { dayjs } from './dayjs'
import { TimelineFailure } from './failure'
import type { TweetInfo } from './post'

const NullableStringSchema = z.union([z.string(), z.null()]).transform((v) => (v === '' ? null : v))
const EventTypeSchema = z
  .union([z.enum(['announcement', 'start', 'ongoing', 'end']), z.literal(''), z.null()])
  .transform((v) => (v === '' ? null : v))

export const TweetExtractionSchema = z.object({
  isDistributionEvent: z.boolean(),
  eventType: EventTypeSchema,
  title: NullableStringSchema,
  startDate: NullableStringSchema,
  endDate: NullableStringSchema,
  endAt: NullableStringSchema,
  category: z
    .union([z.enum(['ackey', 'regular_card', 'limited_card', 'other']), z.literal(''), z.null()])
    .transform((value) => (value === '' ? null : value))
})

export type TweetExtraction = z.infer<typeof TweetExtractionSchema>

const TweetExtractionsSchema = z.object({
  events: z.array(TweetExtractionSchema)
})

/**
 * OpenAI互換APIでツイートから配布イベント情報を抽出（JSON Schema使用）
 */
export const parseTweet = async (env: Bindings, tweet: TweetInfo): Promise<TweetExtraction[]> => {
  // SDKのprocess.envへのフォールバックを避け、WorkersのBindingsだけを使う。
  for (const binding of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'] as const) {
    if (!env[binding]?.trim()) {
      throw new Error(`${binding} binding is required`)
    }
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    timeout: 60_000,
    maxRetries: 2
  })
  const tweetDate = dayjs(tweet.createdAt)
  const dateStr = tweetDate.format('YYYY-MM-DD')
  const year = tweetDate.year()

  const instructions = [
    `このツイートは${dateStr}に投稿されました。`,
    '与えられたメッセージから配布イベント情報を抽出してください。',
    '1つのツイートに複数の配布開始・終了情報がある場合は、対象ごとに別イベントとしてすべて抽出してください。',
    '配布イベントが含まれない場合はeventsを空配列にしてください。',
    '',
    '配布イベントの判定基準（isDistributionEvent）:',
    '- true: ビッカメ娘・店舗の名刺やビッカメ娘のアクリルキーホルダーなどの配布開始・終了の案内',
    '- false: 日常のツイート、挨拶、感想、宣伝など配布イベントではない内容。またはビッカメ娘に関連しない内容',
    '',
    'イベントタイプ（eventType）:',
    '- announcement: 配布開始前の告知。「明日から」「○日から開始予定」など',
    '- start: 配布開始の案内。「本日から」「配布開始しました」など',
    '- ongoing: 配布継続中の案内。「まだあります」「配布中」「残りあり」など',
    '- end: 配布終了の案内。「配布終了」「なくなりました」など',
    '',
    'タイトル（title）:',
    '- 配布イベントの内容を簡潔に表すタイトル（1文字以上20文字以内）',
    '- 全角英数字があれば半角に変換すること',
    '- 例: 「バレンタイン限定名刺」「爆誕記念アクキー」「通年名刺」など',
    '',
    'カテゴリの判定基準 (配布イベントの場合のみ):',
    '- ackey: アクリルキーホルダー、アクキーに関する内容',
    '- limited_card: 期間限定や数量限定の名刺配布',
    '- regular_card: 通年配布の名刺（限定ではない名刺）',
    '- other: 上記に該当しない場合',
    'イベントの開始日 (startDate) :',
    'ツイートの内容から推定されるイベントの開始日(YYYY-MM-DD形式)、わからない場合には空文字列""',
    `年がわからない場合には${year}年として推定してください。`,
    'イベントの終了日 (endDate) :',
    'ツイートの内容から推定されるイベントの終了日(YYYY-MM-DD形式)、わからない場合には空文字列""',
    `年がわからない場合には${year}年として推定してください。`,
    'イベントの完了日 (endAt) :',
    'ツイートの内容から推定される限定数の配布が終わった日(YYYY-MM-DD形式)、わからない場合には空文字列""',
    `年がわからない場合には${year}年として推定してください。`
  ].join('\n')

  const response = await client.responses
    .create({
      model: env.OPENAI_MODEL,
      instructions,
      input: tweet.text,
      text: {
        format: {
          type: 'json_schema',
          name: 'tweet_extraction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    isDistributionEvent: { type: 'boolean' },
                    eventType: { type: 'string', enum: ['announcement', 'start', 'ongoing', 'end', ''] },
                    title: { type: 'string' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' },
                    endAt: { type: 'string' },
                    category: { type: 'string', enum: ['ackey', 'regular_card', 'limited_card', 'other', ''] }
                  },
                  required: ['isDistributionEvent', 'eventType', 'title', 'startDate', 'endDate', 'endAt', 'category']
                }
              }
            },
            required: ['events']
          }
        }
      }
    })
    .catch(() => {
      throw new TimelineFailure('analysis')
    })

  if (response.status === 'incomplete') {
    throw new Error('OpenAI response was truncated')
  }

  for (const item of response.output) {
    if (item.type !== 'message') continue
    for (const part of item.content) {
      if (part.type === 'refusal') {
        throw new Error('OpenAI refused to analyze the tweet')
      }
    }
  }

  const content = response.output_text.trim()
  if (!content) {
    throw new Error('OpenAI returned an empty response')
  }

  try {
    const parsed = TweetExtractionsSchema.safeParse(JSON.parse(content))
    if (!parsed.success) throw new TimelineFailure('analysis')
    return parsed.data.events
  } catch {
    throw new TimelineFailure('analysis')
  }
}
