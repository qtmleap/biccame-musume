// seed --fix: seed で作った自動作成分（events.is_verified=0）を、今の規則で直す。ローカル D1（.wrangler/state）だけが対象。
//   1. 告知か開始の参考 URL がリプライの投稿のイベント、または店舗がビッカメ娘ではない（characters.json の is_biccame_musume が false）
//      イベントは、イベントごと削除する（子の行も明示的に消す）。他のテーブルが参照していれば削除しない。
//      参考 URL の行を別の投稿に差し替えることはしない（終了の参考 URL がリプライなのは問題にしない）
//   2. 削除しないイベントのうち、終了予定日も終了日も無く、最後の言及から STALE_ENDED_DAYS 日以上たったものに、最後の言及の日を ended_at として入れる
//   3. 削除しないイベントのうち、配布数が MAX_LIMITED_QUANTITY を超えるものは、limited_quantity を消し、配布条件を everyone にする
//   4. 終了が分からないまま止まっているイベント（終了予定日も終了日も無く、最後の言及が開始日より前で終了日を推定できず、開始が
//      基準日の STALE_ENDED_DAYS 日以上前。isEndUnknown）は、2 を先に評価して入らなかったものを、イベントごと削除する
//   5. 題がアクスタ（アクスタ・アクリルスタンド。アクキーを含まない）で category が other のイベントを acsta に付け替える（judgeAcsta）。
//      これだけは確認済み（is_verified=1）の行と、seed が作ったと確かめられない行も対象にする（題で決まる規則で、emulate のイベントとの対応は要らない）
// 1〜3 の削除・変更は、確認済み（is_verified=1）の行と、seed が作ったと確かめられない行には触れない（5 の category だけが例外）。
// 自動作成分とそのイベントの元（emulate のイベント）の対応は、seed --apply が書いたレポートの (店舗, 開始日, 題, 作成時刻) で 1 対 1 に引く。

export { buildAcstaProductionSql } from './seed-fix/acsta-sql'
export { applyFix, type FixWriteOptions } from './seed-fix/apply'
export { describeFix } from './seed-fix/describe'
export { matchEvents, type MatchedEvent, type UnmatchedEvent, type UnmatchedReason } from './seed-fix/matching'
export {
  buildFixPlan,
  changedEvents,
  countChanges,
  planAcsta,
  type AcstaKept,
  type FixEventPlan,
  type FixOutcome,
  type FixPlan,
  type ReferenceRow
} from './seed-fix/plan'
export { deletedByStartYear, endedByStartYear, endUnknownByStartYear, fixReport, summarizeFix } from './seed-fix/report'
export { readAppliedReports, type ReportEntry } from './seed-fix/reports-input'
export { runFix } from './seed-fix/run'
export type { AcstaSqlRun, FixRun, FixRunOptions } from './seed-fix/run-types'
export {
  readFixSnapshot,
  type CategoryRow,
  type FixSnapshot,
  type ReferencingTable,
  type SnapshotEvent
} from './seed-fix/snapshot'
