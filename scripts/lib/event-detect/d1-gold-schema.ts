import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { EventCategorySchema, EventConditionTypeSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'

// D1の人手修正済みイベント1件。日付はJST換算済みの *Jst を使う（startDate自体は JST 0:00 をUTC表記にした値）。
export const GoldConditionSchema = z.object({
  type: EventConditionTypeSchema,
  purchaseAmount: z.number().int().nonnegative().optional(),
  chargeAmount: z.number().int().nonnegative().optional(),
  quantity: z.number().int().positive().optional()
})
export const GoldEventSchema = z.object({
  uuid: z.uuid(),
  title: z.string().nonempty(),
  stores: z.array(z.string().nonempty()).nonempty(),
  // 空は「未注釈」。正解として扱うのは明示された分だけ。
  characterIds: z.array(z.string().nonempty()),
  category: EventCategorySchema,
  startDateJst: z.iso.date(),
  endDateJst: z.iso.date().optional(),
  conditions: z.array(GoldConditionSchema),
  limitedQuantity: z.number().int().positive().optional(),
  isVerified: z.boolean(),
  isPreliminary: z.boolean()
})
export const GoldCaseSchema = z.object({
  caseId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  postId: z.string().regex(/^\d+$/),
  bucket: z.string().nonempty(),
  flags: z.array(z.string().nonempty()),
  post: DetectPostSchema,
  postCreatedAtJst: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  events: z.array(GoldEventSchema).nonempty()
})
export const GoldFileSchema = z.object({
  schemaVersion: z.number().int(),
  // 別枠（RT・他者への返信・投稿が開始日より後）は測定の対象にしない。件数の確認だけに使う。
  main: z.array(GoldCaseSchema),
  sidelined: z.record(z.string().nonempty(), z.array(z.unknown()))
})
export type GoldCondition = z.infer<typeof GoldConditionSchema>
export type GoldEvent = z.infer<typeof GoldEventSchema>
export type GoldCase = z.infer<typeof GoldCaseSchema>

// 採点に使う正解だけを集めた保存形式。モデルへの入力ファイルとは別に置く。
export const GoldBundleSchema = z.object({
  inputSha256: z.string().nonempty(),
  cases: z.record(
    z.string().nonempty(),
    z.object({ postId: z.string().nonempty(), events: z.array(GoldEventSchema).nonempty() })
  )
})
export type GoldBundle = z.infer<typeof GoldBundleSchema>

export const sha256Hex = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

export const loadGoldCases = async (path: string) => {
  const bytes = await readFile(path)
  const parsed = GoldFileSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
  if (!parsed.success) throw new Error('Invalid D1 gold case file')
  const duplicated = parsed.data.main.length !== new Set(parsed.data.main.map((sample) => sample.postId)).size
  if (duplicated) throw new Error('Duplicated post in D1 gold case file')
  return {
    sha256: sha256Hex(bytes),
    cases: parsed.data.main,
    sidelined: Object.fromEntries(Object.entries(parsed.data.sidelined).map(([bucket, rows]) => [bucket, rows.length]))
  }
}

// AIへ渡すのは原投稿の公開項目だけ。正解（events）・店舗/娘の注釈・過去の判定は混ぜない。
const modelInput = z.object({ post: DetectPostSchema.omit({ extractionContext: true }) })
export const goldModelPost = (sample: unknown) => {
  const parsed = modelInput.safeParse(sample)
  if (!parsed.success) throw new Error('Invalid gold evaluation post')
  return parsed.data.post
}

export const goldBundleOf = (cases: readonly GoldCase[], inputSha256: string): GoldBundle => ({
  inputSha256,
  cases: Object.fromEntries(cases.map((sample) => [sample.caseId, { postId: sample.postId, events: sample.events }]))
})

// Mapへ要素を足すための小さな集計補助。`??` の代わりに未登録かどうかを明示的に分ける。
export const groupByKey = <T>(rows: readonly T[], keyOf: (row: T) => string) =>
  rows.reduce((acc, row) => {
    const key = keyOf(row)
    const list = acc.get(key)
    return acc.set(key, list === undefined ? [row] : [...list, row])
  }, new Map<string, T[]>())

export const countByKey = <T>(rows: readonly T[], keyOf: (row: T) => string): Record<string, number> =>
  Object.fromEntries(
    [...groupByKey(rows, keyOf)]
      .map(([key, list]): [string, number] => [key, list.length])
      .sort(([a], [b]) => a.localeCompare(b))
  )
