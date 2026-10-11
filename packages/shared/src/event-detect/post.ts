import { z } from 'zod'

/**
 * 投稿の種別。リツイートかつ引用のように重なる場合は retweet > reply > quote の順で決める。
 */
export const DetectPostKindSchema = z.enum(['original', 'retweet', 'quote', 'reply'])

export type DetectPostKind = z.infer<typeof DetectPostKindSchema>

/**
 * 引用元・リツイート元の投稿。アーカイブに本文が含まれない場合 text は省く。
 */
const ReferencedPostSchema = z.object({
  id: z.string().regex(/^\d+$/),
  screenName: z.string().nonempty().optional(),
  text: z.string().nonempty().optional()
})

/**
 * イベント検出に使う投稿。X の生レスポンスから判定に要る項目だけを抜き出したもの。
 * 本文は HTML エンティティを戻した全文（長文投稿は note_tweet 側）を持つ。
 */
export const DetectPostSchema = z.object({
  id: z.string().regex(/^\d+$/),
  createdAt: z.iso.datetime(),
  screenName: z.string().nonempty(),
  kind: DetectPostKindSchema,
  text: z.string().nonempty(),
  url: z.url(),
  replyTo: z.object({ id: z.string().regex(/^\d+$/), screenName: z.string().nonempty() }).optional(),
  quoted: ReferencedPostSchema.optional(),
  retweeted: ReferencedPostSchema.optional(),
  media: z.array(z.url()).default([])
})

export type DetectPost = z.infer<typeof DetectPostSchema>
