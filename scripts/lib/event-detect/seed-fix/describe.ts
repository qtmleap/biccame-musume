import { isStaleStart, MAX_LIMITED_QUANTITY, type RowCounts, STALE_ENDED_DAYS, TABLES } from '../seed'
import type { FixEventPlan } from './plan'
import {
  deletedByStartYear,
  endedByStartYear,
  endUnknownByStartYear,
  KINDS,
  summarizeFix,
  unmatchedNoEnd
} from './report'
import type { AcstaSqlRun, FixRun, FixRunOptions } from './run-types'
import type { CategoryRow } from './snapshot'

/** ログに出す削除例の行数の上限。全件はレポート */
const DELETE_EXAMPLES = 10

const total = (counts: RowCounts) => TABLES.map((table) => `${table}=${counts[table]}`).join(' ')

const kindText = (counts: Record<string, number>) => KINDS.map((kind) => `${kind}=${counts[kind]}`).join(' ')

/** 本番 D1 用の SQL のログ */
const describeAcstaSql = (sql: AcstaSqlRun): string[] => [
  '',
  `本番 D1 用の SQL（作っただけで実行しない）: ${sql.path}`,
  `  ${sql.count} 件（元データ gold.json の確認済みイベント ${sql.goldEvents} 件、${sql.source}、取得 ${sql.fetchedAt}）`,
  `  ローカル D1 の同じ id の行: 確認済み ${sql.match.verified} / 確認済みではない ${sql.match.unverified} / 無い ${sql.match.absent}`,
  ...sql.rows.map(
    (row) =>
      `    ${row.id} [${row.title}] ローカル: ${row.local === null ? '無し' : `${row.local.isVerified ? '確認済み' : '自動作成'} category=${row.local.category}`}`
  ),
  `  ローカル D1 の確認済みで題がアクスタ（category が other か acsta）なのに SQL に無い: ${sql.localVerifiedNotInSql.length} 件`,
  ...sql.localVerifiedNotInSql.map((row) => `    ${row.id} [${row.title}] category=${row.category}`)
]

/** 実行結果のログ（標準出力に出す行） */
export const describeFix = (options: FixRunOptions, run: FixRun): string[] => {
  const { plan } = run
  const summary = summarizeFix(plan)
  const eventLabel = (event: { title: string; store: string; startDay: string }) =>
    `${event.store} ${event.startDay} [${event.title}]`
  const deleted = plan.events.filter((event) => event.outcome === 'delete')
  const blocked = plan.events.filter((event) => event.outcome === 'blocked')
  const storeDeleted = deleted.filter((event) => event.notBiccame)
  const quantityEvents = plan.events.filter((event) => event.outcome === 'change' && event.quantity !== null)
  const endUnknownEvents = deleted.filter((event) => event.endUnknown)
  const freshKept = plan.events.filter(
    (event) =>
      (event.outcome === 'change' || event.outcome === 'none') &&
      event.endedState === 'fresh' &&
      isStaleStart(event.startDay, plan.today)
  )
  const owner = (row: CategoryRow) => (row.isVerified ? '確認済み' : '自動作成')
  const rows = summary.deleted.rows
  const reasonText = (event: FixEventPlan) =>
    [
      ...(event.replies.length > 0
        ? [
            `リプライ: ${event.replies.map((row) => `${row.type}=${row.url} (${row.kind === null ? 'unknown' : row.kind})`).join(' ')}`
          ]
        : []),
      ...(event.notBiccame ? [`店舗: ${event.store}`] : []),
      ...(event.endUnknown ? ['終了が分からない: 終了予定日も終了日も無く、最後の言及が開始日より前'] : [])
    ].join(' / ')
  return [
    `seed --fix: ${options.apply ? '--apply（ローカル D1 に書く）' : '--dry-run（書かない）'} 基準日(JST)=${plan.today} STALE_ENDED_DAYS=${STALE_ENDED_DAYS} MAX_LIMITED_QUANTITY=${MAX_LIMITED_QUANTITY}`,
    `db: ${options.dbPath}`,
    `PRAGMA foreign_keys=${run.snapshot.foreignKeys}（0 なら ON DELETE CASCADE は働かない。子の行は明示的に消す）`,
    `events を参照するテーブル: ${run.snapshot.referencing.map(({ table, column }) => `${table}.${column}`).join(' ')}（子として一緒に消す: ${['event_stores', 'event_reference_urls', 'event_conditions'].join(' ')}。それ以外に参照があれば削除しない）`,
    `対応付けに使ったレポート: ${run.reports.join(' ')}`,
    '',
    `is_verified=0 のイベント: ${run.snapshot.events} 件 = 対応が引けた ${summary.matched} 件 + 引けなかった ${summary.unmatched.total} 件（触らない）`,
    `引けなかった理由: ${
      summary.unmatched.total === 0
        ? '（なし）'
        : Object.entries(summary.unmatched.byReason)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(' ')
    }`,
    ...plan.unmatched.map(
      ({ event, reason }) =>
        `  ${event.stores.join(',')} ${event.startDate} [${event.title}] created_at=${event.createdAt} ${reason}`
    ),
    '',
    `イベントごとの結果: ${Object.entries(summary.outcomes)
      .map(([outcome, count]) => `${outcome}=${count}`)
      .join(' ')}`,
    '',
    '参考 URL の行は UPDATE / DELETE / INSERT しない（リプライの告知・開始と、ビッカメ娘ではない店舗はイベントごと削除する。終了の行は変えない）',
    `今の参考 URL の行の投稿の種類（対応が引けた全イベント）: announce[${kindText(summary.currentKinds.announce)}] start[${kindText(summary.currentKinds.start)}] end[${kindText(summary.currentKinds.end)}]`,
    '',
    `削除する自動作成分（is_verified=0）: ${deleted.length} 件 = リプライだけ ${summary.deleted.reasons.replyOnly} + 店舗だけ ${summary.deleted.reasons.storeOnly} + 両方 ${summary.deleted.reasons.both} + 終了が分からない ${summary.deleted.reasons.endUnknown}（リプライ = 告知か開始の参考 URL がリプライ / 店舗 = ビッカメ娘ではない店舗 / 終了が分からない = 下記）`,
    `  リプライが理由（店舗と重なる分を含む）: ${summary.deleted.replyTypes.total} 件 = 告知だけ ${summary.deleted.replyTypes.announceOnly} + 開始だけ ${summary.deleted.replyTypes.startOnly} + 両方 ${summary.deleted.replyTypes.both}`,
    `  店舗が理由（リプライと重なる分を含む）: ${summary.deleted.byStore.reduce((sum, entry) => sum + entry.count, 0)} 件 = ${summary.deleted.byStore.map((entry) => `${entry.store}×${entry.count}`).join(' ')}（ビッカメ娘ではない店舗: ${[...plan.nonBiccameStores].sort().join(' ')}）`,
    `  一緒に消える行: events=${rows.events} event_stores=${rows.event_stores} event_reference_urls=${rows.event_reference_urls} event_conditions=${rows.event_conditions}`,
    `  開始年別: ${deletedByStartYear(plan)
      .map((row) => `${row.year}=${row.count}`)
      .join(' ')}`,
    `  例（先頭 ${Math.min(DELETE_EXAMPLES, deleted.length)} 件。全件はレポート）:`,
    ...deleted.slice(0, DELETE_EXAMPLES).map((event) => `    ${eventLabel(event)} ${reasonText(event)}`),
    `  店舗が理由の例（先頭 ${Math.min(DELETE_EXAMPLES, storeDeleted.length)} 件）:`,
    ...storeDeleted.slice(0, DELETE_EXAMPLES).map((event) => `    ${eventLabel(event)} ${reasonText(event)}`),
    `終了が分からないまま止まっているため削除（終了予定日も終了日も無く、最後の言及が開始日より前で終了日を推定できず、開始が基準日の ${STALE_ENDED_DAYS} 日以上前。ended_at の推定を先に評価して入らなかったもの。削除の合計に含む）: ${summary.endUnknown.deleted} 件`,
    `  開始年別: ${endUnknownByStartYear(plan)
      .map((row) => `${row.year}=${row.count}`)
      .join(' ')}`,
    `  例（先頭 ${Math.min(DELETE_EXAMPLES, endUnknownEvents.length)} 件。全件はレポート）:`,
    ...endUnknownEvents.slice(0, DELETE_EXAMPLES).map((event) => `    ${eventLabel(event)}`),
    `  残す（終了の情報が無く開始が ${STALE_ENDED_DAYS} 日以上前だが、最後の言及が ${STALE_ENDED_DAYS} 日以内で今も配布中かもしれない）: ${freshKept.length} 件`,
    ...freshKept.map((event) => `    ${eventLabel(event)}`),
    `  触らない（対応が引けず最後の言及が分からない。終了の情報が無く開始が ${STALE_ENDED_DAYS} 日以上前）: ${summary.endUnknown.unmatchedNoEnd} 件`,
    ...unmatchedNoEnd(plan).map(({ event }) => `    ${event.stores.join(',')} ${event.startDate} [${event.title}]`),
    `削除の理由に当たるが、他のテーブルが参照しているので削除しない（変更しない）: ${blocked.length} 件`,
    ...blocked.map(
      (event) => `  ${eventLabel(event)} ${event.blockedBy.map(({ table, count }) => `${table}=${count}`).join(' ')}`
    ),
    `対応が引けず触らないイベントのうち、店舗がビッカメ娘ではないもの: ${summary.unmatchedNotBiccame} 件`,
    '',
    `ended_at（終了予定日も終了日も無いイベント。削除するイベントと削除できないイベントを除く）: 推定で入れる ${summary.endedAt.estimated} 件 / 最後の言及から ${STALE_ENDED_DAYS} 日未満で null のまま ${summary.endedAt.fresh} 件 / 開始日より前になるので入れない ${summary.endedAt.beforeStart} 件`,
    '  開始年別（入れる / 30 日未満で null のまま / 開始日より前）:',
    ...endedByStartYear(plan).map((row) => `    ${row.year}: ${row.estimated} / ${row.fresh} / ${row.beforeStart}`),
    '',
    `配布数が ${MAX_LIMITED_QUANTITY} を超えるので limited_quantity を消し、配布条件を everyone にする（削除しないイベントのみ）: ${quantityEvents.length} 件`,
    ...quantityEvents.map(
      (event) => `  ${eventLabel(event)} limited_quantity=${event.quantity === null ? '' : event.quantity.from}`
    ),
    '',
    `acsta に付け替える（題がアクスタ・アクリルスタンドで、アクキー・キーホルダーを含まない other。確認済みも対象。削除するイベントは除く）: ${plan.recategorize.length} 件 = 確認済み ${summary.acsta.recategorize.verified} + 自動作成 ${summary.acsta.recategorize.unverified}`,
    ...plan.recategorize.map((row) => `  ${owner(row)} ${row.id} [${row.title}]`),
    `題がアクスタだが付け替えない: ${plan.acstaKept.length} 件 = アクキーを含む題 ${summary.acsta.kept.keepAckey} + ackey・limited_card・regular_card ${summary.acsta.kept.keepCategory}`,
    ...plan.acstaKept.map(
      (row) =>
        `  ${owner(row)} ${row.id} [${row.title}] category=${row.category}（${row.verdict === 'keep_ackey' ? 'アクキーを含む題' : 'category が other ではない'}）`
    ),
    ...(run.acstaSql ? describeAcstaSql(run.acstaSql) : []),
    '',
    `ローカル D1 の件数（書く前）: ${total(run.counts)}`,
    ...(run.applied
      ? [
          `バックアップ: ${run.applied.backupPath}`,
          `書き込み後: ${total(run.applied.after)}`,
          `増減: ${TABLES.map((table) => `${table}=${run.applied ? run.applied.after[table] - run.applied.before[table] : 0}`).join(' ')}`
        ]
      : [options.apply ? '変更が 0 件のため、書き込みもバックアップもしていない' : '書き込みなし（--apply で書く）']),
    `レポート: ${run.reportPath}`
  ]
}
