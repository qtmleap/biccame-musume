import { DropReasonSchema, POST_SCOPES } from '@biccame/shared/event-detect/viewer'
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
export const EventDetectPostsSearchSchema = z.object({
  scope: z.enum(POST_SCOPES).default('unlabeled').catch('unlabeled'),
  account: text.optional().catch(undefined),
  reason: DropReasonSchema.optional().catch(undefined),
  q: text.optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  until: z.iso.date().optional().catch(undefined),
  dedup: z.boolean().default(true).catch(true),
  page: page.default(1).catch(1)
})

export const EVENT_DETECT_EVENT_MODES = ['all', 'end_candidate', 'no_archived', 'announce_only'] as const

/** D1 イベント一覧の絞り込み */
export const EventDetectEventsSearchSchema = z.object({
  mode: z.enum(EVENT_DETECT_EVENT_MODES).default('end_candidate').catch('end_candidate'),
  q: text.optional().catch(undefined)
})
