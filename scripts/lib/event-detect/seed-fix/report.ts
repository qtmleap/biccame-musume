import type { DetectPostKind } from '@biccame/shared/event-detect/post'
import { isStaleStart, jstDayOf, MAX_LIMITED_QUANTITY, type ReferenceType, STALE_ENDED_DAYS } from '../seed'
import { chain } from './common'
import type { FixEventPlan, FixPlan } from './plan'
import type { FixRun, FixRunOptions } from './run-types'

const TYPES: readonly ReferenceType[] = ['announce', 'start', 'end']
export const KINDS = ['original', 'reply', 'quote', 'retweet', 'unknown'] as const

const tally = <T extends string>(keys: readonly T[], values: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length]))

const replyTypesOf = (event: FixEventPlan) => [...new Set(event.replies.map((row) => row.type))]

/** 削除する理由。reply=告知か開始の参考 URL がリプライ / store=ビッカメ娘ではない店舗 / both=両方 / end_unknown=終了が分からないまま止まっている */
const deleteReasonOf = (event: FixEventPlan) =>
  event.endUnknown
    ? 'end_unknown'
    : event.replies.length > 0 && event.notBiccame
      ? 'both'
      : event.notBiccame
        ? 'store'
        : 'reply'

/** 開始年ごとのイベントの数 */
const countByStartYear = (events: readonly FixEventPlan[]) =>
  [...new Set(events.map((event) => event.startDay.slice(0, 4)))]
    .sort()
    .map((year) => ({ year, count: events.filter((event) => event.startDay.startsWith(year)).length }))

/** 開始年ごとの、削除するイベントの数 */
export const deletedByStartYear = (plan: FixPlan) =>
  countByStartYear(plan.events.filter((event) => event.outcome === 'delete'))

/** 開始年ごとの、終了が分からないまま止まっていて削除するイベントの数 */
export const endUnknownByStartYear = (plan: FixPlan) =>
  countByStartYear(plan.events.filter((event) => event.outcome === 'delete' && event.endUnknown))

/** 開始日（JST）が基準日から STALE_ENDED_DAYS 日以上前で、終了の情報が無い、対応が引けなかったイベント（最後の言及が分からないので触らない） */
export const unmatchedNoEnd = (plan: FixPlan) =>
  plan.unmatched.filter(({ event }) => {
    const day = jstDayOf(event.startDate)
    return event.endDate === null && event.endedAt === null && day !== undefined && isStaleStart(day, plan.today)
  })

/** 直しの集計。ログとレポートの両方に使う */
export const summarizeFix = (plan: FixPlan) => {
  const kindName = (kind: DetectPostKind | null) => (kind === null ? 'unknown' : kind)
  const applied = plan.events.filter((event) => event.outcome === 'change')
  const deleted = plan.events.filter((event) => event.outcome === 'delete')
  const survivors = plan.events.filter((event) => event.outcome === 'change' || event.outcome === 'none')
  const withReplies = deleted.filter((event) => event.replies.length > 0)
  const replyOnly = (type: ReferenceType) =>
    withReplies.filter((event) => replyTypesOf(event).length === 1 && replyTypesOf(event).includes(type)).length
  const storeDeleted = deleted.filter((event) => event.notBiccame)
  const reasons = deleted.map(deleteReasonOf)
  return {
    matched: plan.events.length,
    unmatched: {
      total: plan.unmatched.length,
      byReason: Object.fromEntries(
        [...new Set(plan.unmatched.map(({ reason }) => reason))].map((reason) => [
          reason,
          plan.unmatched.filter((entry) => entry.reason === reason).length
        ])
      )
    },
    outcomes: tally(
      ['delete', 'blocked', 'change', 'none'],
      plan.events.map((event) => event.outcome)
    ),
    // 対応が引けず触らないイベントのうち、店舗がビッカメ娘ではないもの（確認済みは is_verified=0 の対象に入らない）
    unmatchedNotBiccame: plan.unmatched.filter(({ event }) =>
      event.stores.some((store) => plan.nonBiccameStores.has(store))
    ).length,
    // 削除するイベント。reasons=削除の理由の内訳、replyTypes=リプライが理由のもの（店舗と重なる分を含む）のうち、どちらがリプライだったか、
    // byStore=ビッカメ娘ではない店舗が理由のもの（リプライと重なる分を含む）の店舗別
    deleted: {
      total: deleted.length,
      reasons: {
        replyOnly: reasons.filter((reason) => reason === 'reply').length,
        storeOnly: reasons.filter((reason) => reason === 'store').length,
        both: reasons.filter((reason) => reason === 'both').length,
        endUnknown: reasons.filter((reason) => reason === 'end_unknown').length
      },
      replyTypes: {
        total: withReplies.length,
        announceOnly: replyOnly('announce'),
        startOnly: replyOnly('start'),
        both: withReplies.filter((event) => replyTypesOf(event).length > 1).length
      },
      byStore: [...new Set(storeDeleted.map((event) => event.store))]
        .map((store) => ({ store, count: storeDeleted.filter((event) => event.store === store).length }))
        .sort((a, b) => chain(b.count - a.count, a.store.localeCompare(b.store))),
      // 一緒に消える子の行
      rows: {
        events: deleted.length,
        event_stores: deleted.reduce((sum, event) => sum + event.children.event_stores, 0),
        event_reference_urls: deleted.reduce((sum, event) => sum + event.children.event_reference_urls, 0),
        event_conditions: deleted.reduce((sum, event) => sum + event.children.event_conditions, 0)
      }
    },
    // マッチした全イベントの今の参考 URL の行を、種別×投稿の種類で数える
    currentKinds: Object.fromEntries(
      TYPES.map((type) => [
        type,
        tally(
          KINDS,
          plan.events.flatMap((event) =>
            event.references.filter((row) => row.type === type).map((row) => kindName(row.kind))
          )
        )
      ])
    ),
    endedAt: {
      estimated: survivors.filter((event) => event.endedState === 'estimated').length,
      fresh: survivors.filter((event) => event.endedState === 'fresh').length,
      beforeStart: survivors.filter((event) => event.endedState === 'before_start').length
    },
    quantity: applied.filter((event) => event.quantity !== null).length,
    // 終了が分からないまま止まっているイベント。deleted=削除 / blocked=参照があるので残す /
    // freshKept=終了の情報が無く開始が古いが、最後の言及が最近のため残す / unmatchedNoEnd=終了の情報が無く開始が古いが、対応が引けず触らない
    endUnknown: {
      deleted: deleted.filter((event) => event.endUnknown).length,
      blocked: plan.events.filter((event) => event.outcome === 'blocked' && event.endUnknown).length,
      freshKept: survivors.filter((event) => event.endedState === 'fresh' && isStaleStart(event.startDay, plan.today))
        .length,
      unmatchedNoEnd: unmatchedNoEnd(plan).length
    },
    // acsta の付け替え（確認済みも含む）と、題がアクスタだが付け替えない行
    acsta: {
      recategorize: {
        total: plan.recategorize.length,
        verified: plan.recategorize.filter((row) => row.isVerified).length,
        unverified: plan.recategorize.filter((row) => !row.isVerified).length
      },
      kept: {
        total: plan.acstaKept.length,
        keepAckey: plan.acstaKept.filter((row) => row.verdict === 'keep_ackey').length,
        keepCategory: plan.acstaKept.filter((row) => row.verdict === 'keep_category').length
      }
    }
  }
}

/** 開始年ごとの、終了日の推定の結果（入れた / 30 日未満で null のまま / 開始日より前で入れない） */
export const endedByStartYear = (plan: FixPlan) => {
  const rows = plan.events.filter(
    (event) => (event.outcome === 'change' || event.outcome === 'none') && event.endedState !== 'has_end'
  )
  return [...new Set(rows.map((event) => event.startDay.slice(0, 4)))].sort().map((year) => {
    const inYear = rows.filter((event) => event.startDay.startsWith(year))
    return {
      year,
      estimated: inYear.filter((event) => event.endedState === 'estimated').length,
      fresh: inYear.filter((event) => event.endedState === 'fresh').length,
      beforeStart: inYear.filter((event) => event.endedState === 'before_start').length
    }
  })
}

export const fixReport = (options: FixRunOptions, run: FixRun) => ({
  generatedAt: options.now,
  mode: options.apply ? 'apply' : 'dry-run',
  db: options.dbPath,
  reports: run.reports,
  today: run.plan.today,
  staleEndedDays: STALE_ENDED_DAYS,
  nonBiccameStores: [...run.plan.nonBiccameStores].sort(),
  maxLimitedQuantity: MAX_LIMITED_QUANTITY,
  foreignKeys: run.snapshot.foreignKeys,
  referencing: run.snapshot.referencing,
  summary: summarizeFix(run.plan),
  endedByStartYear: endedByStartYear(run.plan),
  deletedByStartYear: deletedByStartYear(run.plan),
  endUnknownByStartYear: endUnknownByStartYear(run.plan),
  unmatchedNoEnd: unmatchedNoEnd(run.plan).map(({ event }) => ({
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    stores: event.stores
  })),
  acsta: {
    recategorize: run.plan.recategorize,
    kept: run.plan.acstaKept
  },
  acstaSql: run.acstaSql === undefined ? null : run.acstaSql,
  unmatched: run.plan.unmatched.map(({ event, reason }) => ({
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    createdAt: event.createdAt,
    stores: event.stores,
    reason
  })),
  events: run.plan.events
    .filter((event) => event.outcome !== 'none')
    .map((event) => ({
      eventId: event.eventId,
      emulatedId: event.emulatedId,
      title: event.title,
      store: event.store,
      startDate: event.startDay,
      outcome: event.outcome,
      deleteReason: event.outcome === 'delete' || event.outcome === 'blocked' ? deleteReasonOf(event) : null,
      replies: event.replies,
      notBiccame: event.notBiccame,
      endedAt: event.endedAt,
      endedState: event.endedState,
      quantity: event.quantity,
      children: event.outcome === 'delete' ? event.children : null,
      blockedBy: event.blockedBy
    }))
})
