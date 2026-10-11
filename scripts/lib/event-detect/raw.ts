import { type DetectPost, DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

// list-timeline アーカイブ (scripts/archive-list-timeline.ts) の 1 行を DetectPost に変換する。
// raw は X GraphQL の Tweet をそのまま保存したもので、可視性制限付きの投稿は
// TweetWithVisibilityResults に包まれている。引用元・リツイート元も同様。

const ArchiveRecordSchema = z.object({
  id: z.string().regex(/^\d+$/),
  createdAt: z.iso.datetime(),
  author: z.object({ screenName: z.string().nonempty() }),
  url: z.url(),
  raw: z.unknown()
})

const VisibilityWrapperSchema = z.object({
  __typename: z.literal('TweetWithVisibilityResults'),
  tweet: z.unknown()
})

const MediaSchema = z.object({ media_url_https: z.url() })

const TweetSchema = z.object({
  rest_id: z.string().regex(/^\d+$/).optional(),
  core: z
    .object({
      user_results: z.object({ result: z.object({ core: z.object({ screen_name: z.string().nonempty() }) }) })
    })
    .optional(),
  // 本文が画像だけの投稿は空文字になる。空かどうかは変換側で判定する。
  note_tweet: z
    .object({ note_tweet_results: z.object({ result: z.object({ text: z.string().max(100_000) }) }) })
    .optional(),
  // 元投稿が削除されていると result が欠ける
  quoted_status_result: z.object({ result: z.unknown().optional() }).optional(),
  legacy: z.object({
    id_str: z.string().regex(/^\d+$/),
    full_text: z.string().max(100_000),
    in_reply_to_status_id_str: z.string().regex(/^\d+$/).optional(),
    in_reply_to_screen_name: z.string().nonempty().optional(),
    quoted_status_id_str: z.string().regex(/^\d+$/).optional(),
    retweeted_status_result: z.object({ result: z.unknown().optional() }).optional(),
    extended_entities: z.object({ media: z.array(MediaSchema) }).optional()
  })
})

type Tweet = z.infer<typeof TweetSchema>

/**
 * 可視性ラッパーを外して Tweet として読む。削除済み（TweetTombstone）などは undefined。
 */
export const unwrapTweet = (value: unknown): Tweet | undefined => {
  const wrapped = VisibilityWrapperSchema.safeParse(value)
  const result = TweetSchema.safeParse(wrapped.success ? wrapped.data.tweet : value)
  return result.success ? result.data : undefined
}

// X は full_text の < > & だけをエスケープして返す。
const decodeEntities = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const fullText = (tweet: Tweet) =>
  decodeEntities(tweet.note_tweet ? tweet.note_tweet.note_tweet_results.result.text : tweet.legacy.full_text)

const referenced = (tweet: Tweet) => {
  const text = fullText(tweet)
  return {
    id: tweet.legacy.id_str,
    ...(tweet.core ? { screenName: tweet.core.user_results.result.core.screen_name } : {}),
    ...(text ? { text } : {})
  }
}

export type ArchiveConversion = { post: DetectPost } | { skipped: 'invalid_record' | 'invalid_tweet' | 'empty_text' }

/**
 * アーカイブの 1 レコードを変換する。変換できない場合は理由を返す（例外は投げない）。
 */
export const fromArchiveRecord = (value: unknown): ArchiveConversion => {
  const record = ArchiveRecordSchema.safeParse(value)
  if (!record.success) return { skipped: 'invalid_record' }
  const tweet = unwrapTweet(record.data.raw)
  if (!tweet) return { skipped: 'invalid_tweet' }

  const { legacy } = tweet
  const retweet = legacy.retweeted_status_result ? unwrapTweet(legacy.retweeted_status_result.result) : undefined
  const quote = tweet.quoted_status_result ? unwrapTweet(tweet.quoted_status_result.result) : undefined
  const replyTo =
    legacy.in_reply_to_status_id_str && legacy.in_reply_to_screen_name
      ? { id: legacy.in_reply_to_status_id_str, screenName: legacy.in_reply_to_screen_name }
      : undefined
  const kind = legacy.retweeted_status_result
    ? 'retweet'
    : replyTo
      ? 'reply'
      : quote || legacy.quoted_status_id_str
        ? 'quote'
        : 'original'

  const quoted = quote
    ? referenced(quote)
    : legacy.quoted_status_id_str
      ? { id: legacy.quoted_status_id_str }
      : undefined
  const retweeted = retweet ? referenced(retweet) : undefined
  const text = fullText(tweet)
  if (!text) return { skipped: 'empty_text' }

  const parsed = DetectPostSchema.safeParse({
    id: record.data.id,
    createdAt: record.data.createdAt,
    screenName: record.data.author.screenName,
    kind,
    text,
    url: record.data.url,
    ...(replyTo ? { replyTo } : {}),
    ...(quoted ? { quoted } : {}),
    ...(retweeted ? { retweeted } : {}),
    media: legacy.extended_entities ? legacy.extended_entities.media.map((media) => media.media_url_https) : []
  })
  return parsed.success ? { post: parsed.data } : { skipped: 'invalid_record' }
}
