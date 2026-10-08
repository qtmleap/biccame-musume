import { z } from 'zod'

// ビューワ（ブラウザ）と dev サーバーで共有する API の形。

/** bun dev（vite）上でビューワを配信するパス。アプリの /api と重ならないようにする */
export const VIEWER_BASE = '/__event-detect'

export const LabelSchema = z.object({
  /** 配布イベントに関する投稿か */
  verdict: z.enum(['event', 'not_event', 'unsure']),
  type: z.enum(['announce', 'start', 'ongoing', 'end']).optional(),
  note: z.string().nonempty().max(500).optional(),
  updatedAt: z.iso.datetime()
})

export type Label = z.infer<typeof LabelSchema>

export type Labels = Record<string, Label>

export const LabelRequestSchema = LabelSchema.omit({ updatedAt: true })

export type LabelRequest = z.infer<typeof LabelRequestSchema>

export const LabelResponseSchema = z.object({ label: LabelSchema.nullable() })

const ReferenceTypeSchema = z.enum(['announce', 'start', 'end'])
const KeywordGroupSchema = z.enum(['item', 'give', 'condition', 'end', 'start'])
const DropReasonSchema = z.enum(['retweet', 'reply_to_other', 'non_store_account', 'no_keyword'])

export const PostViewSchema = z.object({
  id: z.string().nonempty(),
  createdAt: z.iso.datetime(),
  screenName: z.string().nonempty(),
  kind: z.enum(['original', 'retweet', 'quote', 'reply']),
  text: z.string().nonempty(),
  url: z.url(),
  replyTo: z.object({ id: z.string().nonempty(), screenName: z.string().nonempty() }).optional(),
  quoted: z
    .object({
      id: z.string().nonempty(),
      screenName: z.string().nonempty().optional(),
      text: z.string().nonempty().optional()
    })
    .optional(),
  media: z.array(z.url()),
  reason: DropReasonSchema.optional(),
  hits: z.array(z.object({ keyword: z.string().nonempty(), group: KeywordGroupSchema })),
  strong: z.boolean(),
  gold: z.array(z.object({ eventId: z.uuid(), type: ReferenceTypeSchema, title: z.string().nonempty() })),
  cluster: z.object({ id: z.string().nonempty(), size: z.number().int().positive() }),
  nearbyEvents: z.number().int().nonnegative(),
  label: LabelSchema.optional()
})

export type PostView = z.infer<typeof PostViewSchema>

const GoldCountsSchema = z.object({
  gold: z.number().int().nonnegative(),
  goldByType: z.object({
    announce: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative()
  })
})

export const SummarySchema = z.object({
  source: z.object({
    archive: z.string().nonempty(),
    posts: z.number().int().nonnegative(),
    from: z.iso.datetime(),
    until: z.iso.datetime(),
    /** アーカイブの取得が最後まで終わったか。false なら期間内でも投稿が欠けうる */
    complete: z.boolean(),
    pages: z.number().int().nonnegative(),
    goldFetchedAt: z.iso.datetime(),
    events: z.number().int().nonnegative()
  }),
  funnel: z.array(
    z
      .object({ key: z.string().nonempty(), label: z.string().nonempty(), posts: z.number().int().nonnegative() })
      .extend(GoldCountsSchema.shape)
  ),
  totals: GoldCountsSchema,
  missingGold: z.array(
    z.object({
      id: z.string().nonempty(),
      screenName: z.string().nonempty(),
      inRange: z.boolean(),
      events: z.array(z.object({ eventId: z.uuid(), type: ReferenceTypeSchema, title: z.string().nonempty() }))
    })
  ),
  droppedGold: z.array(PostViewSchema),
  labels: z.object({
    total: z.number().int().nonnegative(),
    event: z.number().int().nonnegative(),
    notEvent: z.number().int().nonnegative(),
    unsure: z.number().int().nonnegative()
  })
})

export type Summary = z.infer<typeof SummarySchema>

export const KeywordStatSchema = z.object({
  keyword: z.string().nonempty(),
  group: KeywordGroupSchema,
  disabled: z.boolean(),
  posts: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  onlyPosts: z.number().int().nonnegative(),
  onlyGold: z.number().int().nonnegative()
})

export const KeywordsResponseSchema = z.object({ keywords: z.array(KeywordStatSchema) })

export const KeywordsRequestSchema = z.object({ disabled: z.array(z.string().nonempty()) })

export const POST_SCOPES = ['passed', 'dropped', 'all', 'gold', 'gold_dropped', 'unlabeled', 'strong'] as const

export const PostQuerySchema = z.object({
  scope: z.enum(POST_SCOPES).default('passed'),
  account: z.string().nonempty().optional(),
  reason: DropReasonSchema.optional(),
  q: z.string().nonempty().optional(),
  from: z.iso.date().optional(),
  until: z.iso.date().optional(),
  dedup: z.enum(['0', '1']).default('0'),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(500).default(100)
})

export type PostQuery = z.infer<typeof PostQuerySchema>

export const PostsResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  posts: z.array(PostViewSchema)
})

const EventViewSchema = z.object({
  uuid: z.uuid(),
  title: z.string().nonempty(),
  category: z.string().nonempty(),
  stores: z.array(z.string().nonempty()),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  refs: z.object({
    announce: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative()
  }),
  archived: z.number().int().nonnegative(),
  related: z.number().int().nonnegative(),
  endCandidate: z.boolean()
})

export type EventView = z.infer<typeof EventViewSchema>

export const EventsResponseSchema = z.object({ events: z.array(EventViewSchema) })

export const EventDetailResponseSchema = z.object({
  event: EventViewSchema.extend({
    referenceUrls: z.array(z.object({ type: ReferenceTypeSchema, url: z.url(), archived: z.boolean() }))
  }),
  posts: z.array(PostViewSchema)
})

export const GapsResponseSchema = z.object({
  gaps: z.array(
    z.object({
      account: z.string().nonempty(),
      stores: z.array(z.string().nonempty()),
      posts: z.array(PostViewSchema)
    })
  )
})

export const AccountsResponseSchema = z.object({
  accounts: z.array(
    z.object({
      screenName: z.string().nonempty(),
      stores: z.array(z.string().nonempty()),
      total: z.number().int().nonnegative(),
      passed: z.number().int().nonnegative(),
      gold: z.number().int().nonnegative()
    })
  )
})
