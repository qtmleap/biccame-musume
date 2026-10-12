import { EventCharacterSchema } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'

/** 1画像に載せる行数。 */
export const ROWS_PER_IMAGE = 4
/** 片側（開始 / 終了）で画像に載せる行数の上限。超えた行は「ほか N件」にまとめる。 */
export const MAX_ROWS_PER_SIDE = 8
/** 1投稿に添付する画像数の上限（X の添付上限）。 */
export const MAX_IMAGES_PER_POST = 4
/** 追加・更新の画像で重ねて見せる娘の人数の上限。 */
export const MAX_AVATARS_PER_EVENT = 3

const TextSchema = z.string().nonempty()
const CountSchema = z.number().int().positive()

/**
 * スナップショットは「保存した時点の固定内容」で、描画側はデータベースを再取得せずにこれだけで描く。
 * そのため Event を丸ごとは持たず、描画に必要な確定済みの文字列・キーだけを持つ。
 * 公開状態（isVerified）は保存せず、uuid を使って送信直前に D1 で確認する。
 */

/** 追加・更新の1件表示で描くイベント。 */
export const SocialEventViewSchema = z.object({
  uuid: z.uuid(),
  title: TextSchema,
  /** 開催店舗の表示名。 */
  stores: z.array(TextSchema).nonempty(),
  /** 重ねて描く娘。先頭が手前。対象が特殊値のときは 'secret' / 'other' だけを持つ。 */
  avatars: z.array(EventCharacterSchema).nonempty().max(MAX_AVATARS_PER_EVENT),
  /** 開催店舗の娘と違うときだけ入る対象ラベル（特殊値は「シークレット」「その他」）。 */
  target: TextSchema.nullable(),
  /** 「M/D(曜) 〜 M/D(曜)」「M/D(曜) のみ」「M/D(曜) 〜 終了日未定」。 */
  period: TextSchema,
  /** 条件ラベル。限定数は「限定N個」として末尾に入る。 */
  conditions: z.array(TextSchema)
})
export type SocialEventView = z.infer<typeof SocialEventViewSchema>

/** 毎朝・毎週の画像の1行。同じ内容のイベントは店舗違いでも1行にまとまる。 */
export const SocialRowSchema = z.object({
  /** この行にまとまった元イベントの uuid（並び順）。 */
  eventIds: z.array(z.uuid()).nonempty(),
  title: TextSchema,
  /** まとまったイベントの店舗表示名。重複なし、出現順。 */
  stores: z.array(TextSchema).nonempty(),
  /** Avatar に描く娘。先頭イベントの対象（店舗キーまたは 'secret' / 'other'）。 */
  avatar: EventCharacterSchema,
  /** 行全体で同じ娘を指すときだけ入る対象ラベル。 */
  target: TextSchema.nullable(),
  /** 開始側は「M/D(曜)まで」「終了日未定」、終了側は無し。開始日と終了日が同じ日なら両側とも「1日のみ」。 */
  period: TextSchema.nullable(),
  /** 毎週の左端日付「M/D(曜)」。毎朝は無し。同じ日付が続く行は画像内で先頭行だけに入る。 */
  date: TextSchema.nullable()
})
export type SocialRow = z.infer<typeof SocialRowSchema>

export const SocialSideSchema = z.enum(['starting', 'ending'])
export type SocialSide = z.infer<typeof SocialSideSchema>

export const SocialEventImageSchema = z.object({ type: z.literal('event'), event: SocialEventViewSchema })
export type SocialEventImage = z.infer<typeof SocialEventImageSchema>

export const SocialSummaryImageSchema = z
  .object({
    type: z.literal('summary'),
    side: SocialSideSchema,
    /** 見出しの日付。毎朝は「2026年4月29日(水)」、毎週は「3/9(月)〜3/15(日)」。 */
    headline: TextSchema,
    page: CountSchema,
    pageCount: CountSchema,
    rows: z.array(SocialRowSchema).nonempty().max(ROWS_PER_IMAGE),
    /** この側の元イベント数（まとめた行数ではない。見出しの件数）。 */
    total: CountSchema,
    /** 「ほか N件」の N。8行を超えて隠れた行の元イベント数で、最後の画像にだけ入る。 */
    more: CountSchema.optional(),
    /**
     * 「ほか N件」に隠れた元イベントの uuid（隠れていなければ空）。
     * 隠れたイベントも公開確認の対象にし、後から非公開になったものを件数に数えたまま投稿しないために持つ。
     */
    hiddenEventIds: z.array(z.uuid())
  })
  .refine((image) => image.page <= image.pageCount, { message: 'Invalid social image page', path: ['page'] })
  .refine(
    (image) =>
      image.more === undefined ? image.hiddenEventIds.length === 0 : image.more === image.hiddenEventIds.length,
    {
      message: 'Invalid social image more',
      path: ['more']
    }
  )
export type SocialSummaryImage = z.infer<typeof SocialSummaryImageSchema>

/** その側が0件のときの、文字だけの画像。 */
export const SocialEmptyImageSchema = z.object({
  type: z.literal('empty'),
  side: SocialSideSchema,
  headline: TextSchema
})
export type SocialEmptyImage = z.infer<typeof SocialEmptyImageSchema>

export const SocialImageSchema = z.discriminatedUnion('type', [
  SocialEventImageSchema,
  SocialSummaryImageSchema,
  SocialEmptyImageSchema
])
export type SocialImage = z.infer<typeof SocialImageSchema>

/** 毎朝・毎週の画像（開始と終了のどちらか）。 */
export type SocialSideImage = SocialSummaryImage | SocialEmptyImage
export const isSocialSideImage = (image: SocialImage): image is SocialSideImage => image.type !== 'event'

const isSummaryPost = (snapshot: { kind: string }): boolean => snapshot.kind === 'daily' || snapshot.kind === 'weekly'

/**
 * 投稿1件分のスナップショット。画像は1〜4枚で、毎朝・毎週は「開始の画像 → 終了の画像」の順に並ぶ。
 * 旧形式（events / page / pageCount）は未出荷のため読み替えない。
 */
export const SocialSnapshotSchema = z
  .object({
    kind: z.enum(['created', 'updated', 'daily', 'weekly']),
    key: TextSchema,
    scheduledAt: z.iso.datetime(),
    text: TextSchema,
    quoteTweetId: TextSchema.optional(),
    images: z.array(SocialImageSchema).nonempty().max(MAX_IMAGES_PER_POST)
  })
  .refine(
    (snapshot) =>
      isSummaryPost(snapshot)
        ? snapshot.images.every(isSocialSideImage)
        : snapshot.images.length === 1 && snapshot.images[0].type === 'event',
    { message: 'Invalid social snapshot images', path: ['images'] }
  )
  .refine(
    (snapshot) => {
      if (!isSummaryPost(snapshot)) return true
      const sides = snapshot.images.filter(isSocialSideImage).map((image) => image.side)
      // 開始側 → 終了側の順で、両方の側が揃っている。
      return (
        sides.includes('starting') &&
        sides.includes('ending') &&
        sides.every((side, index) => index === 0 || !(sides[index - 1] === 'ending' && side === 'starting'))
      )
    },
    { message: 'Invalid social snapshot sides', path: ['images'] }
  )
export type SocialSnapshot = z.infer<typeof SocialSnapshotSchema>

export const SocialQueueMessageSchema = z.object({ kind: z.literal('social'), jobId: z.string().nonempty() })
export type SocialQueueMessage = z.infer<typeof SocialQueueMessageSchema>

/** スナップショットの全画像に含まれる元イベントの uuid（重複なし）。公開確認に使う。 */
export const snapshotEventIds = (snapshot: SocialSnapshot): string[] => [
  ...new Set(
    snapshot.images.flatMap((image) => {
      if (image.type === 'event') return [image.event.uuid]
      return image.type === 'summary' ? [...image.rows.flatMap((row) => row.eventIds), ...image.hiddenEventIds] : []
    })
  )
]
