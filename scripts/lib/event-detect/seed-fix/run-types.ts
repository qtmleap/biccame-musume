import type { RowCounts } from '../seed'
import type { FixPlan } from './plan'
import type { ReferencingTable } from './snapshot'

export type FixRunOptions = {
  /** .cache/event-detect（emulated-v1.json / posts.jsonl の場所。バックアップもここに書く） */
  dir: string
  /** レポートとバックアップを書ける場所（.cache） */
  cacheRoot: string
  dbPath: string
  /** characters.json。ビッカメ娘ではない店舗（is_biccame_musume が false）の判定に使う */
  charactersPath: string
  apply: boolean
  /** 対応付けに使う、seed --apply が書いたレポート */
  reports: readonly string[]
  /** 直しの計画の出力先（.cache 配下のみ） */
  reportPath: string
  /** 実行時刻（ISO）。基準日（JST）と updated_at に使う */
  now: string
  /** 本番 D1 用の acsta の付け替え SQL の出力先（.cache 配下のみ）。省略すると作らない。--dry-run でも書く（実行はしない） */
  acstaSqlPath?: string
}

/** 本番 D1 用の acsta の付け替え SQL を作った結果と、ローカル D1 との照合 */
export type AcstaSqlRun = {
  path: string
  /** 元データ（gold.json）の取得元と取得時刻・件数 */
  source: string
  fetchedAt: string
  goldEvents: number
  /** SQL の行数（付け替える本番の確認済みイベント） */
  count: number
  /** SQL の行ごとの、ローカル D1 の同じ id の行。無ければ local は null */
  rows: { id: string; title: string; local: { isVerified: boolean; category: string } | null }[]
  /** ローカル D1 にも同じ id の行がある数（確認済み / 確認済みではない）と、無い数 */
  match: { verified: number; unverified: number; absent: number }
  /** ローカル D1 の確認済みの行のうち、題がアクスタ（other か acsta）なのに SQL に無いもの（本番に無い、または本番では別の題・カテゴリ） */
  localVerifiedNotInSql: { id: string; title: string; category: string }[]
}

export type FixRun = {
  plan: FixPlan
  snapshot: { events: number; foreignKeys: number; referencing: ReferencingTable[] }
  counts: RowCounts
  reports: readonly string[]
  reportPath: string
  /** --apply で書いたとき。変更が 0 件なら undefined */
  applied?: { backupPath: string; before: RowCounts; after: RowCounts }
  /** acsta の付け替え SQL を作ったとき */
  acstaSql?: AcstaSqlRun
}
