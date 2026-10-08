import type { Label, PostView } from '@biccame/shared/event-detect/viewer'
import { EVENT_CATEGORY_LABELS, STORE_NAME_LABELS } from '@/locales/app.content'
import { EventCategorySchema } from '@/schemas/event.dto'
import { StoreKeySchema } from '@/schemas/store.dto'

// イベント検出ビューワの表示用ラベルと、意味ごとの配色（theme トークンのみ）。

type LabelType = NonNullable<Label['type']>

export const TYPE_LABELS: Record<LabelType, string> = {
  announce: '告知',
  start: '開始',
  ongoing: '継続中',
  end: '終了'
}

export const REASON_LABELS: Record<NonNullable<PostView['reason']>, string> = {
  retweet: 'RT',
  reply_to_other: '他者宛てリプライ',
  non_store_account: '店舗外アカウント',
  no_keyword: 'キーワードなし',
  excluded_keyword: '除外語'
}

export const KIND_LABELS: Record<PostView['kind'], string> = {
  original: '通常',
  retweet: 'RT',
  quote: '引用',
  reply: 'リプライ'
}

export const GROUP_LABELS: Record<PostView['hits'][number]['group'], string> = {
  item: '景品',
  give: '配布方法',
  condition: '購入条件',
  end: '終了',
  start: '開始'
}

export const EXCLUDE_GROUP_LABELS: Record<PostView['excludeHits'][number]['group'], string> = {
  sales: '商品の販売・予約',
  games: 'トレカ・ゲーム',
  appliances: '家電・売場',
  promotion: '販促・体験'
}

/** 店舗キーを表示名にする。未知のキーはそのまま出す */
export const storeName = (key: string): string => {
  const parsed = StoreKeySchema.safeParse(key)
  return parsed.success ? STORE_NAME_LABELS[parsed.data] : key
}

export const categoryName = (category: string): string => {
  const parsed = EventCategorySchema.safeParse(category)
  return parsed.success ? EVENT_CATEGORY_LABELS[parsed.data] : category
}

/** 淡い背景＋色付きの枠。文字は常に foreground にして、ライト/ダークとも読めるようにする */
export const TONE = {
  success: 'border-success/50 bg-success/15 text-foreground',
  info: 'border-info/50 bg-info/15 text-foreground',
  warning: 'border-warning/60 bg-warning/20 text-foreground',
  destructive: 'border-destructive/50 bg-destructive/15 text-foreground',
  muted: 'border-border bg-muted text-muted-foreground'
} as const

/** 正解（参考 URL が指す投稿）の種別。イベントの状態色と揃える */
export const GOLD_TONE: Record<LabelType, string> = {
  announce: 'border-transparent bg-status-upcoming text-status-upcoming-foreground',
  start: 'border-transparent bg-status-ongoing text-status-ongoing-foreground',
  ongoing: 'border-transparent bg-status-ongoing text-status-ongoing-foreground',
  end: 'border-transparent bg-status-ended text-status-ended-foreground'
}

/** 数値列の共通クラス */
export const NUM = 'text-right font-numeric tabular-nums'
