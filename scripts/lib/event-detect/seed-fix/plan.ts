import type { DetectPostKind } from '@biccame/shared/event-detect/post'
import { parseStatusUrl } from '../gold'
import {
  estimateEnded,
  isEndUnknown,
  isReplyKind,
  jstDayToUtcIso,
  judgeAcsta,
  MAX_LIMITED_QUANTITY,
  type PostInfo,
  type SeedEvent
} from '../seed'
import { chain, OWNED_TABLES } from './common'
import type { MatchedEvent, UnmatchedEvent } from './matching'
import type { CategoryRow, ReferencingTable, SnapshotEvent } from './snapshot'

/**
 * イベントごとの結果。
 *  delete=告知か開始の参考 URL がリプライ、店舗がビッカメ娘ではない、または終了が分からないまま止まっている（endUnknown）ので、
 *  イベントごと削除する / blocked=同じだが他のテーブルが参照しているので変更しない / change=終了日か配布数を直す / none=直すところが無い
 */
export type FixOutcome = 'delete' | 'blocked' | 'change' | 'none'

/** 参考 URL の行。kind は posts.jsonl で投稿の種類を引けなかったとき null */
export type ReferenceRow = { type: string; url: string; kind: DetectPostKind | null }

export type FixEventPlan = {
  eventId: string
  emulatedId: string
  title: string
  store: string
  startDay: string
  outcome: FixOutcome
  /** 今の参考 URL の行（変更の有無にかかわらず、マッチした全イベント） */
  references: ReferenceRow[]
  /** 告知・開始の参考 URL でリプライになっている行（delete / blocked の理由） */
  replies: ReferenceRow[]
  /** 店舗がビッカメ娘ではない（delete / blocked の理由）。replies と両方に当たるイベントは「両方」と数える */
  notBiccame: boolean
  /**
   * 終了が分からないまま止まっている（delete / blocked の理由。isEndUnknown）。replies / notBiccame に当たるイベントは
   * そちらを理由にするので false。終了日を推定で入れる（estimated）イベントと、最後の言及が最近の（fresh）イベントは true にならない
   */
  endUnknown: boolean
  /** 終了予定日も終了日も無い。結果: estimated=ended_at を入れる / fresh=最後の言及から STALE_ENDED_DAYS 日未満で null のまま / before_start=開始日より前になるので入れない / has_end=終了の情報がある（削除するイベントも含む） */
  endedState: 'estimated' | 'fresh' | 'before_start' | 'has_end'
  endedAt: { day: string; iso: string } | null
  /** limited_quantity が MAX_LIMITED_QUANTITY を超えている。直す配布条件の行の ID */
  quantity: { from: number; conditionIds: string[] } | null
  /** 消すとき、イベントと一緒に消す子の行数 */
  children: { event_stores: number; event_reference_urls: number; event_conditions: number }
  blockedBy: { table: string; count: number }[]
}

/** acsta の付け替えが要らない・しない行。verdict=keep_ackey（アクキーと一緒の題）/ keep_category（ackey・limited_card・regular_card） */
export type AcstaKept = CategoryRow & { verdict: 'keep_ackey' | 'keep_category' }

export type FixPlan = {
  /** 基準日（JST の暦日）。終了日の推定はここからの日数で決まる */
  today: string
  /** ビッカメ娘ではない店舗キー（characters.json の is_biccame_musume が false） */
  nonBiccameStores: ReadonlySet<string>
  events: FixEventPlan[]
  unmatched: UnmatchedEvent[]
  /** 削除の前に他のテーブルの参照を確かめ直す対象 */
  blockers: ReferencingTable[]
  /** category を other から acsta に付け替える行（確認済みも含む全イベント。削除するイベントは除く） */
  recategorize: CategoryRow[]
  /** 題がアクスタだが付け替えない行（削除するイベントは除く） */
  acstaKept: AcstaKept[]
}

/** 終了予定日も終了日も無いときだけ、最後の言及から終了日を推定する（seed の新規作成と同じ estimateEnded） */
const estimateEndedAt = (
  event: SnapshotEvent,
  emulated: SeedEvent,
  startDay: string,
  today: string
): Pick<FixEventPlan, 'endedState' | 'endedAt'> => {
  if (event.endDate !== null || event.endedAt !== null) return { endedState: 'has_end', endedAt: null }
  const estimate = estimateEnded(emulated.lastSeen, startDay, today)
  const iso = estimate.kind === 'estimated' ? jstDayToUtcIso(estimate.day) : undefined
  return estimate.kind === 'estimated' && iso !== undefined
    ? { endedState: 'estimated', endedAt: { day: estimate.day, iso } }
    : { endedState: estimate.kind === 'estimated' ? 'before_start' : estimate.kind, endedAt: null }
}

const planEvent = (
  { event, emulated, store, startDay }: MatchedEvent,
  context: { posts: ReadonlyMap<string, PostInfo>; nonBiccameStores: ReadonlySet<string>; today: string }
): FixEventPlan => {
  const kindOf = (url: string) => {
    const status = parseStatusUrl(url)
    const post = status === undefined ? undefined : context.posts.get(status.id)
    return post === undefined ? null : post.kind
  }
  const references = event.references.map(({ type, url }): ReferenceRow => ({ type, url, kind: kindOf(url) }))
  // 告知か開始の参考 URL がリプライ（seed の新規作成と同じ isReplyKind）。終了の行は見ない。posts.jsonl に無い投稿は kind が分からないので数えない
  const replies = references.filter(
    (row) => (row.type === 'announce' || row.type === 'start') && row.kind !== null && isReplyKind(row.kind)
  )
  const base = {
    eventId: event.id,
    emulatedId: emulated.id,
    title: event.title,
    store,
    startDay,
    references,
    replies,
    notBiccame: context.nonBiccameStores.has(store),
    children: {
      event_stores: event.stores.length,
      event_reference_urls: event.references.length,
      event_conditions: event.conditions.length
    },
    blockedBy: event.blockedBy
  }
  if (replies.length > 0 || base.notBiccame) {
    const outcome: FixOutcome = event.blockedBy.length > 0 ? 'blocked' : 'delete'
    return { ...base, outcome, endUnknown: false, endedState: 'has_end', endedAt: null, quantity: null }
  }
  // 終了日と配布数は、削除しないイベントにだけ当てる。終了日の推定（B）を先に評価し、入らなかったものだけが終了不明の削除の対象
  const ended = estimateEndedAt(event, emulated, startDay, context.today)
  if (isEndUnknown(ended.endedState, startDay, context.today)) {
    const outcome: FixOutcome = event.blockedBy.length > 0 ? 'blocked' : 'delete'
    return { ...base, outcome, endUnknown: true, endedState: ended.endedState, endedAt: null, quantity: null }
  }
  const quantity =
    event.limitedQuantity !== null && event.limitedQuantity > MAX_LIMITED_QUANTITY
      ? {
          from: event.limitedQuantity,
          conditionIds: event.conditions
            .filter((row) => row.type === 'first_come' && row.quantity !== null && row.quantity > MAX_LIMITED_QUANTITY)
            .map((row) => row.id)
        }
      : null
  return {
    ...base,
    outcome: ended.endedAt !== null || quantity !== null ? 'change' : 'none',
    endUnknown: false,
    endedState: ended.endedState,
    endedAt: ended.endedAt,
    quantity
  }
}

/** 対応が引けたイベントごとに直しを決める。新しい開始日から、同じなら店舗・題の順 */
export const buildFixPlan = (input: {
  matched: readonly MatchedEvent[]
  unmatched: readonly UnmatchedEvent[]
  posts: ReadonlyMap<string, PostInfo>
  /** ビッカメ娘ではない店舗キー（readStoreMarks） */
  nonBiccameStores: ReadonlySet<string>
  today: string
  blockers: readonly ReferencingTable[]
  /** 全イベントの題とカテゴリ（readFixSnapshot の categories）。省略すると acsta の付け替えはしない */
  categories?: readonly CategoryRow[]
}): FixPlan => {
  const events = input.matched
    .map((matched) =>
      planEvent(matched, { posts: input.posts, nonBiccameStores: input.nonBiccameStores, today: input.today })
    )
    .sort((a, b) =>
      chain(
        b.startDay.localeCompare(a.startDay),
        a.store.localeCompare(b.store),
        a.title.localeCompare(b.title),
        a.eventId.localeCompare(b.eventId)
      )
    )
  return {
    today: input.today,
    nonBiccameStores: input.nonBiccameStores,
    events,
    unmatched: [...input.unmatched],
    blockers: input.blockers.filter(({ table }) => !OWNED_TABLES.includes(table)),
    ...planAcsta(
      input.categories === undefined ? [] : input.categories,
      new Set(events.filter((event) => event.outcome === 'delete').map((event) => event.eventId))
    )
  }
}

/** 付け替えの並び: 題、同じなら id */
const byTitle = (a: CategoryRow, b: CategoryRow) => chain(a.title.localeCompare(b.title), a.id.localeCompare(b.id))

/**
 * 題がアクスタの行を、付け替える行（convert）と付け替えない行（keep）に分ける。削除するイベントは両方から除く
 * （消えるイベントの category は直さず、一覧にも出さない）。
 */
export const planAcsta = (rows: readonly CategoryRow[], deleted: ReadonlySet<string>) => {
  const live = rows.filter((row) => !deleted.has(row.id))
  return {
    recategorize: live.filter((row) => judgeAcsta(row.title, row.category) === 'convert').sort(byTitle),
    acstaKept: live
      .flatMap((row): AcstaKept[] => {
        const verdict = judgeAcsta(row.title, row.category)
        return verdict === 'keep_ackey' || verdict === 'keep_category' ? [{ ...row, verdict }] : []
      })
      .sort(byTitle)
  }
}

/** 書き込みを伴うイベント（直す・削除する） */
export const changedEvents = (plan: FixPlan) =>
  plan.events.filter((event) => event.outcome === 'change' || event.outcome === 'delete')

/** 変更の件数（イベントの削除・直しと acsta の付け替え）。0 なら書き込みもバックアップもしない */
export const countChanges = (plan: FixPlan) => changedEvents(plan).length + plan.recategorize.length
