import {
  DropReasonSchema,
  EMULATED_D1_MATCHES,
  EMULATED_SORTS,
  GapStatusSchema,
  POST_JUDGES,
  POST_SCOPES,
  PROBABILITY_BIN_COUNT
} from '@biccame/shared/event-detect/viewer'
import { z } from 'zod'

// TanStack Router は検索パラメータを JSON として読むため、数字だけの文字列は number で届く。文字列へ戻す。
const text = z.union([z.string().nonempty(), z.number().transform(String)])

const page = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
  ])
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))

/** 投稿画面の絞り込み。不正な値は項目ごとに既定へ戻す */
export const EventDetectPostsSearchSchema = z
  .object({
    scope: z.enum(POST_SCOPES).default('unlabeled').catch('unlabeled'),
    account: text.optional().catch(undefined),
    reason: DropReasonSchema.optional().catch(undefined),
    q: text.optional().catch(undefined),
    from: z.iso.date().optional().catch(undefined),
    until: z.iso.date().optional().catch(undefined),
    dedup: z.boolean().default(true).catch(true),
    // チャートの確率のヒストグラムの区間。数値だけを受ける（文字列や範囲外は省略へ戻す）
    judge: z.enum(POST_JUDGES).optional().catch(undefined),
    bin: z
      .number()
      .int()
      .min(0)
      .max(PROBABILITY_BIN_COUNT - 1)
      .optional()
      .catch(undefined),
    page: page.default(1).catch(1)
  })
  // judge と bin は両方そろったときだけ意味を持つ。片方だけなら両方とも外す
  .transform(({ judge, bin, ...rest }) => (judge === undefined || bin === undefined ? rest : { ...rest, judge, bin }))

export const EVENT_DETECT_EVENT_MODES = ['all', 'end_candidate', 'no_archived', 'announce_only'] as const

/** D1 イベント一覧の絞り込み */
export const EventDetectEventsSearchSchema = z.object({
  mode: z.enum(EVENT_DETECT_EVENT_MODES).default('end_candidate').catch('end_candidate'),
  q: text.optional().catch(undefined)
})

export const EVENT_DETECT_ACCOUNT_SORT_KEYS = [
  'screenName',
  'store',
  'posts',
  'candidates',
  'emulated',
  'emulatedEnded',
  'events',
  'goldPosts'
] as const

export const EVENT_DETECT_SORT_ORDERS = ['asc', 'desc'] as const

export type EventDetectAccountSortKey = (typeof EVENT_DETECT_ACCOUNT_SORT_KEYS)[number]

export type EventDetectSortOrder = (typeof EVENT_DETECT_SORT_ORDERS)[number]

/** 統計画面のアカウント別の並べ替え。どちらも省略でき、省略時は投稿数の降順（向きは列ごとの最初の向き） */
export const EventDetectStatsSearchSchema = z.object({
  sort: z.enum(EVENT_DETECT_ACCOUNT_SORT_KEYS).optional().catch(undefined),
  order: z.enum(EVENT_DETECT_SORT_ORDERS).optional().catch(undefined)
})

export type EventDetectStatsSearch = z.infer<typeof EventDetectStatsSearchSchema>

/** 終了の絞り込み。1 は終了あり、0 は終了なし（API の ended=1・0 と同じ。Router は数字だけの値を number で渡す） */
const ended = z.union([z.literal(1), z.literal(0)])

const year = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d{4}$/)
      .transform(Number)
  ])
  .pipe(z.number().int().min(1000).max(9999))

/** LLM イベント一覧の絞り込みと並べ替え。不正な値は項目ごとに省略へ戻す（sort と order は省略時に既定の並び） */
export const EventDetectEmulatedSearchSchema = z.object({
  year: year.optional().catch(undefined),
  store: text.optional().catch(undefined),
  status: GapStatusSchema.optional().catch(undefined),
  ended: ended.optional().catch(undefined),
  d1: z.enum(EMULATED_D1_MATCHES).optional().catch(undefined),
  q: text.optional().catch(undefined),
  sort: z.enum(EMULATED_SORTS).optional().catch(undefined),
  order: z.enum(EVENT_DETECT_SORT_ORDERS).optional().catch(undefined),
  page: page.default(1).catch(1)
})

export type EventDetectEmulatedSearch = z.infer<typeof EventDetectEmulatedSearchSchema>
