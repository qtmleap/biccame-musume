import { z } from 'zod'

// ユーザー情報（実際に使用するフィールドのみ定義、他はpassthroughで許容）
const UserCoreSchema = z
  .object({
    name: z.string(),
    screen_name: z.string()
  })
  .passthrough()

const UserResultSchema = z
  .object({
    core: UserCoreSchema
  })
  .passthrough()

const UserResultsSchema = z
  .object({
    result: UserResultSchema
  })
  .passthrough()

const TweetCoreSchema = z
  .object({
    user_results: UserResultsSchema
  })
  .passthrough()

// ツイートのlegacy情報
const TweetLegacySchema = z
  .object({
    id_str: z.string(),
    created_at: z.string(),
    full_text: z.string()
  })
  .passthrough()

// ツイート検索結果
export const TweetResultsResultSchema = z
  .object({
    core: TweetCoreSchema,
    legacy: TweetLegacySchema
  })
  .passthrough()
export type TweetResultsResult = z.infer<typeof TweetResultsResultSchema>

const TweetResultsSchema = z
  .object({
    result: z.union([TweetResultsResultSchema, z.object({ __typename: z.string() }).passthrough()])
  })
  .passthrough()

// タイムラインエントリの内容
const ItemContentSchema = z
  .object({
    tweet_results: TweetResultsSchema
  })
  .passthrough()

// ツイートのエントリとカーソルのエントリが同じ配列に混ざって返る。
// カーソルはページ送りに使うため、itemContentと並べて受け取る。
const ContentSchema = z
  .object({
    itemContent: ItemContentSchema.optional(),
    cursorType: z.string().optional(),
    value: z.string().optional()
  })
  .passthrough()

const EntrySchema = z
  .object({
    content: ContentSchema
  })
  .passthrough()

const InstructionSchema = z
  .object({
    entries: z.array(EntrySchema).optional()
  })
  .passthrough()

const TimelineSchema = z
  .object({
    instructions: z.array(InstructionSchema)
  })
  .passthrough()

const SearchTimelineSchema = z
  .object({
    timeline: TimelineSchema
  })
  .passthrough()

const SearchByRawQuerySchema = z
  .object({
    search_timeline: SearchTimelineSchema
  })
  .passthrough()

const DataSchema = z
  .object({
    search_by_raw_query: SearchByRawQuerySchema
  })
  .passthrough()

export const PostSchema = z
  .object({
    data: DataSchema
  })
  .passthrough()
export type Post = z.infer<typeof PostSchema>
