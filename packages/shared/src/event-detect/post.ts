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

/** 抽出後の対象物と参考文脈。根拠と元投稿を区別し、他物品の条件を流用しない。 */
export const ExtractionContextSchema = z.object({
  kind: z.enum(['item', 'event']),
  item: z.string().nonempty().max(200),
  evidence: z.array(z.string().nonempty()).nonempty().max(20),
  originalText: z.string().nonempty(),
  quotedText: z.string().nonempty().optional(),
  quotedId: z.string().regex(/^\d+$/).optional(),
  quotedScreenName: z.string().nonempty().optional()
})
export type ExtractionContext = z.infer<typeof ExtractionContextSchema>

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
  media: z.array(z.url()).default([]),
  extractionContext: ExtractionContextSchema.optional()
})

export type DetectPost = z.infer<typeof DetectPostSchema>
