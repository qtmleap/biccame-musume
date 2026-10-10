import { z } from 'zod'

// イベント検出ビューワ（管理画面の /admin/event-detect）と dev サーバーのミドルウェアで共有する API の形。

/** bun dev（vite）のミドルウェアが API を配信するパス。アプリの /api と重ならないようにする */
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

export const ReferenceTypeSchema = z.enum(['announce', 'start', 'end'])
export const KeywordGroupSchema = z.enum(['item', 'give', 'condition', 'end', 'start'])
export const DropReasonSchema = z.enum([
  'retweet',
  'reply_to_other',
  'non_store_account',
  'no_keyword',
  'excluded_keyword'
])
export const ExcludeGroupSchema = z.enum(['sales', 'games', 'appliances', 'promotion'])

/** 確率のヒストグラムの区間数（0.1 刻み。最後の区間は 1.0 を含む）。チャートの区間番号 bin は 0 以上この値未満 */
export const PROBABILITY_BIN_COUNT = 10

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
  excludeHits: z.array(z.object({ keyword: z.string().nonempty(), group: ExcludeGroupSchema })),
  rescueHits: z.array(z.string().nonempty()),
  strong: z.boolean(),
  gold: z.array(z.object({ eventId: z.uuid(), type: ReferenceTypeSchema, title: z.string().nonempty() })),
  cluster: z.object({ id: z.string().nonempty(), size: z.number().int().positive() }),
  nearbyEvents: z.number().int().nonnegative(),
  label: LabelSchema.optional(),
  /** LLM の is_event 確率。判定のキャッシュにある投稿だけ持つ */
  llm: z.number().min(0).max(1).optional(),
  /** Clef の確率。判定のキャッシュにある投稿だけ持つ */
  clef: z.number().min(0).max(1).optional()
})

export type PostView = z.infer<typeof PostViewSchema>

/** 投稿・イベント候補・D1 イベントの件数。年別・アカウント別・全体で同じ数え方をする */
const StatCountsSchema = z.object({
  /** アーカイブの投稿数 */
  posts: z.number().int().nonnegative(),
  /** 機械フィルタを通過した投稿。LLM・Clef の判定前 */
  candidates: z.number().int().nonnegative(),
  /** 参考 URL が D1 イベントに使われている投稿 */
  goldPosts: z.number().int().nonnegative(),
  /** D1 の検証済みイベント。年別は開始日の年、アカウント別は characters.json の 1 店舗で数える */
  events: z.number().int().nonnegative()
})

/** イベント候補への LLM・Clef の判定の件数。判定はローカルのキャッシュから数える（D1 には無い） */
const JudgementCountsSchema = z.object({
  /** イベント候補のうち、LLM（Claude Haiku 5.5）が確率 0.5 以上と判定した投稿の数 */
  llm: z.number().int().nonnegative(),
  /** イベント候補のうち、LLM の判定がある投稿の数 */
  llmJudged: z.number().int().nonnegative(),
  /** イベント候補のうち、Clef が確率 0.5 以上と判定した投稿の数 */
  clef: z.number().int().nonnegative(),
  /** イベント候補のうち、Clef の判定がある投稿の数。精度評価のサンプルだけなので候補の一部 */
  clefJudged: z.number().int().nonnegative()
})

/** emulate コマンドが作ったイベントの件数。エミュレートの結果はローカルのファイルで、D1 には入っていない */
const EmulatedCountsSchema = z.object({
  /** emulate が作ったイベントの数。開始を見ていないもの（startUnknown）も含む */
  emulated: z.number().int().nonnegative(),
  /** そのうち終了報告または告知の終了予定日があるイベントの数（予定日が未来でも数える） */
  emulatedEnded: z.number().int().nonnegative()
})

export const SummarySchema = z.object({
  source: z.object({
    archive: z.string().nonempty(),
    posts: z.number().int().nonnegative(),
    /** 実際の投稿の最古・最新の投稿日時。投稿が 0 件なら null */
    oldest: z.iso.datetime().nullable(),
    newest: z.iso.datetime().nullable(),
    /** アーカイブの取得が最後まで終わったか。false なら投稿が欠けうる */
    complete: z.boolean(),
    pages: z.number().int().nonnegative(),
    goldFetchedAt: z.iso.datetime(),
    events: z.number().int().nonnegative(),
    /** emulate の結果ファイルの更新時刻。emulate を実行していなければ null（emulated・emulatedEnded は 0） */
    emulatedAt: z.iso.datetime().nullable()
  }),
  // llm・llmJudged・clef・clefJudged・emulated・emulatedEnded は年別の合計
  totals: StatCountsSchema.extend(JudgementCountsSchema.shape).extend(EmulatedCountsSchema.shape).extend({
    /** 投稿のあるアカウント数 */
    accounts: z.number().int().nonnegative(),
    /** そのうち characters.json の店舗に対応するアカウント数（store が null でない行） */
    storeAccounts: z.number().int().nonnegative()
  }),
  /** JST の暦年ごと。昇順。投稿が無くても D1 イベントや emulate のイベントがある年は含む。emulated は開始日の年、開始日が無ければ最初の言及の年で数える */
  years: z.array(
    StatCountsSchema.extend(JudgementCountsSchema.shape)
      .extend(EmulatedCountsSchema.shape)
      .extend({ year: z.number().int() })
  ),
  /** 投稿数の降順。同数はアカウント名（小文字）の昇順 */
  accounts: z.array(
    StatCountsSchema.extend(EmulatedCountsSchema.shape).extend({
      screenName: z.string().nonempty(),
      /** characters.json の店舗。X アカウントの無い店舗は載らず、店舗に対応しないアカウントは null。emulated は店舗のイベントで数え、null なら 0 */
      store: z.string().nonempty().nullable()
    })
  ),
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

export const ExcludeStatSchema = z.object({
  keyword: z.string().nonempty(),
  group: ExcludeGroupSchema,
  disabled: z.boolean(),
  posts: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  rescuedGold: z.number().int().nonnegative(),
  onlyPosts: z.number().int().nonnegative(),
  droppedGold: z.number().int().nonnegative()
})

/** 救済語の寄与。除外語に当たったが救済語で通過した投稿を数える */
export const RescueStatSchema = z.object({
  keyword: z.string().nonempty(),
  /** keyword は RESCUE_KEYWORDS の固定の語、character はキャラクター名（○○たん） */
  kind: z.enum(['keyword', 'character']),
  /** 通過した投稿のうち、除外語に当たり、この語を含む件数（この語が守っている投稿） */
  posts: z.number().int().nonnegative(),
  /** posts のうち、当たった救済語がこの語だけの件数（この語が無ければ除外される） */
  onlyPosts: z.number().int().nonnegative(),
  /** posts のうち正解 */
  gold: z.number().int().nonnegative()
})

export type RescueStat = z.infer<typeof RescueStatSchema>

export const KeywordsResponseSchema = z.object({
  keywords: z.array(KeywordStatSchema),
  excludes: z.array(ExcludeStatSchema),
  /** 救済した投稿の降順。同数は語の昇順 */
  rescues: z.array(RescueStatSchema)
})

export const KeywordsRequestSchema = z.object({
  disabled: z.array(z.string().nonempty()),
  disabledExcludes: z.array(z.string().nonempty()).default([])
})

export const POST_SCOPES = ['passed', 'dropped', 'all', 'gold', 'gold_dropped', 'unlabeled', 'strong'] as const

/** 確率の判定の種類。投稿の絞り込み（judge）に使う */
export const POST_JUDGES = ['llm', 'clef'] as const

export const PostQuerySchema = z.object({
  scope: z.enum(POST_SCOPES).default('passed'),
  account: z.string().nonempty().optional(),
  reason: DropReasonSchema.optional(),
  q: z.string().nonempty().optional(),
  from: z.iso.date().optional(),
  until: z.iso.date().optional(),
  dedup: z.enum(['0', '1']).default('0'),
  /**
   * 確率のヒストグラムの区間での絞り込み。judge と bin が両方あるときだけ効く（片方だけなら絞り込まない）。
   * チャートと同じく、イベント候補（除外されていない投稿）のうち judge の判定があり、確率が区間 bin に入る投稿に限り、確率の降順に並べる
   */
  judge: z.enum(POST_JUDGES).optional(),
  bin: z.coerce
    .number()
    .int()
    .min(0)
    .max(PROBABILITY_BIN_COUNT - 1)
    .optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(500).default(100)
})

export type PostQuery = z.infer<typeof PostQuerySchema>

export const PostsResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  posts: z.array(PostViewSchema)
})

export const EventViewSchema = z.object({
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

/** 抽出（scripts/lib/event-detect/extract.ts）の状態。進行順に並べる */
export const GAP_STATUSES = ['announce', 'start', 'ongoing', 'end'] as const

export const GapStatusSchema = z.enum(GAP_STATUSES)

export type GapStatus = z.infer<typeof GapStatusSchema>

export const GapCategorySchema = z.enum(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])

/** 本文の日付候補から選んだ YYYY-MM-DD（実在しない日付も含みうるので ISO 日付としては検証しない） */
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const GapStatusCountsSchema = z.object({
  announce: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  ongoing: z.number().int().nonnegative(),
  end: z.number().int().nonnegative()
})

/**
 * Clef による再確認（scripts/lib/event-detect/emulate.ts の VerifyRecord）。choice と probabilities のキーは
 * その時点の候補のイベント ID か 'new'。
 */
export const GapVerifySchema = z.object({
  choice: z.string().nonempty(),
  /** 選ばれた選択肢の確率 */
  probability: z.number(),
  probabilities: z.record(z.string().nonempty(), z.number()),
  /** 既存のイベントへ合流させたか。false で choice がイベント ID なら、しきい値に届かず見送った */
  merged: z.boolean()
})

export type GapVerify = z.infer<typeof GapVerifySchema>

export const GapEventSchema = z.object({
  id: z.string().nonempty(),
  store: z.string().nonempty(),
  item: z.string().nonempty(),
  category: GapCategorySchema,
  status: GapStatusSchema,
  startDate: DaySchema.optional(),
  endDate: DaySchema.optional(),
  quantity: z.number().int().positive().optional(),
  /** 終了報告の投稿日 */
  endedAt: DaySchema.optional(),
  /** 終了報告から作られ、開始の投稿を見ていない */
  startUnknown: z.boolean(),
  firstSeen: z.iso.datetime(),
  lastSeen: z.iso.datetime(),
  /** 言及した投稿の数（投稿 ID の重複を除く） */
  mentions: z.number().int().positive(),
  /** 状態ごとの言及数（同じ投稿が同じ状態で複数回載っていても 1） */
  statusCounts: GapStatusCountsSchema,
  /** 古い順。同じ投稿は 1 件にまとめ、状態は最も進んだもの。verify は再確認をした言及だけに付く */
  posts: z.array(z.object({ status: GapStatusSchema, post: PostViewSchema, verify: GapVerifySchema.optional() }))
})

export type GapEvent = z.infer<typeof GapEventSchema>

/**
 * 登録漏れ候補。強シグナルの投稿のうち D1 イベント期間に入らないものを、古い順に同じ店舗の未終了イベントと
 * 照合してまとめたもの。まとめた結果が無い（gaps を実行していない）ときは generatedAt が null で pending に全件が入る。
 */
export const GapsResponseSchema = z.object({
  generatedAt: z.iso.datetime().nullable(),
  /** 「新規」と判断された言及の再確認。行っていなければ null */
  verify: z.object({ model: z.string().nonempty(), threshold: z.number() }).nullable(),
  /** 最後の言及が新しい順 */
  events: z.array(GapEventSchema),
  /** 調べたがイベントではないと判定された投稿の数 */
  ignored: z.number().int().nonnegative(),
  /** まだ照合していない候補の投稿（古い順） */
  pending: z.array(PostViewSchema)
})

export type GapsResponse = z.infer<typeof GapsResponseSchema>

/** LLM イベント（emulate が作ったイベント）の ID。店舗キーと連番（kawasaki-12）で、URL のパスに入れても安全な文字だけ */
export const EmulatedIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)

/** Clef による再確認の結果のうち、画面に出す項目だけ（GapVerifySchema の確率の内訳は持たない） */
export const EmulatedVerifySchema = GapVerifySchema.pick({ choice: true, probability: true, merged: true })

export type EmulatedVerify = z.infer<typeof EmulatedVerifySchema>

/** D1 の参考 URL になっている言及から集めた、対応する D1 イベント */
export const EmulatedD1Schema = z.object({ eventId: z.uuid(), title: z.string().nonempty() })

/** 一覧と詳細で共通の、LLM イベント 1 件 */
export const EmulatedEventRowSchema = z.object({
  id: EmulatedIdSchema,
  store: z.string().nonempty(),
  item: z.string().nonempty(),
  category: GapCategorySchema,
  status: GapStatusSchema,
  startDate: DaySchema.optional(),
  endDate: DaySchema.optional(),
  /** 終了報告の投稿日 */
  endedAt: DaySchema.optional(),
  quantity: z.number().int().positive().optional(),
  /** 終了報告から作られ、開始の投稿を見ていない */
  startUnknown: z.boolean(),
  firstSeen: z.iso.datetime(),
  lastSeen: z.iso.datetime(),
  /** 統計の年別と同じ割り当て。開始日の年、無ければ最初の言及の JST 年 */
  year: z.number().int(),
  /** 言及した投稿の数。投稿 ID の重複を除き、今の分析に無い投稿（記念日より前など）は数えない */
  mentions: z.number().int().nonnegative(),
  /** 終了報告か告知の終了予定日がある（統計の「終了」と同じ判定） */
  ended: z.boolean(),
  /** 言及の投稿のうち、D1 イベントの参考 URL になっているものが指す D1 イベント。重複なし、言及の古い順 */
  d1: z.array(EmulatedD1Schema)
})

export type EmulatedEventRow = z.infer<typeof EmulatedEventRowSchema>

/** LLM イベント一覧の並べ替えの列 */
export const EMULATED_SORTS = ['firstSeen', 'lastSeen', 'mentions', 'store'] as const

/** D1 に対応があるか（matched）、無いか（none） */
export const EMULATED_D1_MATCHES = ['matched', 'none'] as const

export const EmulatedQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  store: z.string().nonempty().optional(),
  status: GapStatusSchema.optional(),
  /** 1 は終了あり、0 は終了なし */
  ended: z.enum(['0', '1']).optional(),
  d1: z.enum(EMULATED_D1_MATCHES).optional(),
  /** 配布物名の部分一致 */
  q: z.string().nonempty().optional(),
  sort: z.enum(EMULATED_SORTS).default('firstSeen'),
  /** 省略時は store が昇順、それ以外は降順 */
  order: z.enum(['asc', 'desc']).optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(500).default(100)
})

export type EmulatedQuery = z.infer<typeof EmulatedQuerySchema>

export const EmulatedResponseSchema = z.object({
  /** 絞り込み後の件数 */
  total: z.number().int().nonnegative(),
  events: z.array(EmulatedEventRowSchema),
  /** 絞り込む前の全体の内訳。年は新しい順、店舗は件数の降順（同数は店舗キーの昇順） */
  facets: z.object({
    years: z.array(z.object({ year: z.number().int(), count: z.number().int().positive() })),
    stores: z.array(z.object({ store: z.string().nonempty(), count: z.number().int().positive() }))
  }),
  /** emulate の結果ファイルの更新時刻。emulate を実行していなければ null（total は 0） */
  emulatedAt: z.iso.datetime().nullable()
})

export type EmulatedResponse = z.infer<typeof EmulatedResponseSchema>

export const EmulatedDetailResponseSchema = z.object({
  event: EmulatedEventRowSchema,
  /** 古い順。同じ投稿は 1 件にまとめ、状態は最も進んだもの。verify は再確認をした言及だけに付く */
  posts: z.array(z.object({ status: GapStatusSchema, verify: EmulatedVerifySchema.optional(), post: PostViewSchema }))
})

export type EmulatedDetailResponse = z.infer<typeof EmulatedDetailResponseSchema>

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
