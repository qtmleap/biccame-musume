import { z } from 'zod'

// イベント検出ビューワのチャート画面（/admin/event-detect/charts）が使う集計の形。

/** 確率のヒストグラムの区間数。0.1 刻みで、最後の区間は 1.0 を含む */
const PROBABILITY_BIN_COUNT = 10

/** ヒストグラムの 1 区間。label は 0.0–0.1 のような区間の表記 */
const BinSchema = z.object({
  label: z.string().nonempty(),
  count: z.number().int().nonnegative()
})

/** 確率の区間別の件数。下限の昇順で、区間数は PROBABILITY_BIN_COUNT */
const HistogramSchema = z.array(BinSchema).length(PROBABILITY_BIN_COUNT)

/** JST の暦月（YYYY-MM） */
const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/)

export const ChartsResponseSchema = z.object({
  /** イベント候補のうち LLM 判定済みの投稿の is_event 確率。all は候補全体、gold は D1 参考投稿のみ */
  llmProbability: z.object({ all: HistogramSchema, gold: HistogramSchema }),
  /** イベント候補のうち Clef の判定がある投稿の確率 */
  clefProbability: HistogramSchema,
  /** 月別のイベント数。最初の月から最後の月まで、間の月も 0 で埋めて昇順に並べる */
  monthlyEvents: z.array(
    z.object({
      month: MonthSchema,
      /** LLM が作ったイベント。月は開始日、無ければ最初の言及 */
      llm: z.number().int().nonnegative(),
      /** LLM が終了まで追えたイベント（統計の「終了」と同じ）。月は終了報告の日、無ければ告知の終了予定日 */
      llmEnded: z.number().int().nonnegative(),
      /** D1 イベント。月は開始日 */
      d1: z.number().int().nonnegative()
    })
  ),
  /** 月別の投稿数。最初の月から最後の月まで、間の月も 0 で埋めて昇順に並べる */
  monthlyPosts: z.array(
    z.object({
      month: MonthSchema,
      posts: z.number().int().nonnegative(),
      candidates: z.number().int().nonnegative()
    })
  ),
  /** LLM イベント数の多い店舗の上位。件数の降順、同数は店舗キーの昇順 */
  stores: z.array(z.object({ store: z.string().nonempty(), count: z.number().int().positive() }))
})

export type ChartsResponse = z.infer<typeof ChartsResponseSchema>
