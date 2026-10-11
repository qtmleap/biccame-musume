import { z } from 'zod'
import { EventCategorySchema } from '@/schemas/event.dto'
import { RegionSchema, StoreKeySchema } from '@/schemas/store.dto'

export const DEFAULT_EVENT_CATEGORY = EventCategorySchema.options.join(',')
export const DEFAULT_EVENT_STATUS = 'upcoming,ongoing'
export const EVENT_FILTER_STATUSES = ['upcoming', 'ongoing', 'ended'] as const

// 空文字は「選択なし」。options の組み合わせだけを許す。
const selection = (options: readonly string[]) =>
  z.string().refine((value) => value === '' || value.split(',').every((item) => options.includes(item)))
const urlFlag = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
// 空文字は「店舗の指定なし」。不正な店舗が URL にあっても「パラメータあり」と判別できるよう、この値へ寄せる。
const urlStore = z.union([StoreKeySchema, z.literal('')])

/**
 * 公開イベント一覧の URL search(ルートの validateSearch)
 * 開いただけで URL を書き換えないよう、値の検証も既定値の補完もせず、URL にあるものをそのまま通す。
 * ルーターは検証後の search が URL と違うと URL に書き戻すので、ここで値を変えてはいけない。
 * 値の解釈は読む側で行う(絞り込みは EventListFilterSearchSchema、ページは EventPageSchema)。
 * 他の導線や計測用のsearch値も、絞り込み・ページ変更時に保持する。
 */
const urlParam = z.unknown().optional()
export const EventSearchSchema = z.looseObject({
  category: urlParam,
  status: urlParam,
  region: urlParam,
  store: urlParam,
  page: urlParam,
  hideInterested: urlParam,
  hideCompleted: urlParam,
  hideOldEvents: urlParam
})

/**
 * URL にある絞り込みの 7 項目の解釈
 * URL に書かれたときだけ値を持つ(省略は undefined)。
 * 「URL に絞り込みが 1 つでもあるか」で保存値を使うか決めるので、既定値はここで補わず合成側(resolveEventListFilters)で入れる。
 * 書かれているが不正な値は、「パラメータあり」のまま既定値に戻す。
 * ページは絞り込みではないので、その判定にも保存にも含めない。
 */
export const EventListFilterSearchSchema = z.object({
  category: selection(EventCategorySchema.options).optional().catch(DEFAULT_EVENT_CATEGORY),
  status: selection(EVENT_FILTER_STATUSES).optional().catch(DEFAULT_EVENT_STATUS),
  region: RegionSchema.optional().catch('all'),
  store: urlStore.optional().catch(''),
  hideInterested: urlFlag.optional().catch(false),
  hideCompleted: urlFlag.optional().catch(false),
  hideOldEvents: urlFlag.optional().catch(true)
})
export type EventListFilterSearch = Partial<z.infer<typeof EventListFilterSearchSchema>>

/**
 * URL にあるページの解釈
 * 正の整数だけを受け付ける。省略や不正な値は呼び出し側で 1 として扱う(URL には書き戻さない)。
 */
export const EventPageSchema = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
  ])
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))

/**
 * 公開イベント一覧の絞り込み(localStorage への保存値と、合成後に画面が使う値の形)
 * 項目ごとに検証し、壊れた項目・欠けた項目はその項目だけ既定へ戻す。ページは含めない。
 */
export const EventListFiltersSchema = z.object({
  category: selection(EventCategorySchema.options).default(DEFAULT_EVENT_CATEGORY).catch(DEFAULT_EVENT_CATEGORY),
  status: selection(EVENT_FILTER_STATUSES).default(DEFAULT_EVENT_STATUS).catch(DEFAULT_EVENT_STATUS),
  region: RegionSchema.default('all').catch('all'),
  store: StoreKeySchema.optional().catch(undefined),
  hideInterested: z.boolean().default(false).catch(false),
  hideCompleted: z.boolean().default(false).catch(false),
  hideOldEvents: z.boolean().default(true).catch(true)
})
export type EventListFilters = z.infer<typeof EventListFiltersSchema>

export const DEFAULT_EVENT_LIST_FILTERS: EventListFilters = {
  category: DEFAULT_EVENT_CATEGORY,
  status: DEFAULT_EVENT_STATUS,
  region: 'all',
  store: undefined,
  hideInterested: false,
  hideCompleted: false,
  hideOldEvents: true
}
