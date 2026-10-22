import type { DetectPostKind } from '@biccame/shared/event-detect/post'

/** JST の 2026-10-10 12:00 */
export const NOW = '2026-10-10T03:00:00.000Z'
/** seed --apply が自動作成分を INSERT した時刻（レポートの generatedAt と D1 の created_at） */
export const SEEDED_AT = '2026-10-09T13:24:28.130Z'
const at = (iso: string) => Date.parse(iso)
export const url = (id: string, screenName = 'bic_kashiwa') => `https://x.com/${screenName}/status/${id}`

type RefRow = { type: 'announce' | 'start' | 'end'; id: string; kind: DetectPostKind }

export type EventSpec = {
  /** D1 の events.id */
  id: string
  /** emulate のイベント ID。レポートの emulatedId */
  emulatedId: string
  title: string
  store?: string
  startDay?: string
  verified?: boolean
  createdAt?: string
  endDate?: string | null
  endedAt?: string | null
  limitedQuantity?: number | null
  /** 参考 URL の行。投稿 ID と種類は posts.jsonl にも、emulate の言及（古い順）にもそのまま入る */
  refs: RefRow[]
  lastSeen?: number
  /** first_come の配布条件を持たせる配布数 */
  conditionQuantity?: number | null
}

const ref = (type: RefRow['type'], id: string, kind: DetectPostKind): RefRow => ({ type, id, kind })

export const specs: EventSpec[] = [
  // 告知だけがリプライ → 削除
  {
    id: 'e-del-announce',
    emulatedId: 'kashiwa-1',
    title: '夏名刺',
    startDay: '2026-07-01',
    endDate: '2026-07-31',
    refs: [ref('announce', '1001', 'reply'), ref('start', '1002', 'original'), ref('end', '1003', 'original')]
  },
  // 開始だけがリプライ → 削除
  {
    id: 'e-del-start',
    emulatedId: 'kashiwa-2',
    title: '秋名刺',
    startDay: '2026-07-02',
    endDate: '2026-07-31',
    refs: [ref('announce', '2001', 'original'), ref('start', '2002', 'reply')]
  },
  // 告知も開始もリプライ → 削除（両方）
  {
    id: 'e-del-both',
    emulatedId: 'kashiwa-3',
    title: '冬名刺',
    startDay: '2026-07-03',
    endDate: '2026-07-31',
    refs: [ref('announce', '3001', 'reply'), ref('start', '3002', 'reply')]
  },
  // 告知がリプライだが user_events が参照している → 削除しない（変更しない）
  {
    id: 'e-referenced',
    emulatedId: 'kashiwa-4',
    title: '参照あり名刺',
    startDay: '2026-07-04',
    endDate: '2026-07-31',
    refs: [ref('announce', '4001', 'reply')]
  },
  // 終了だけがリプライ → 問題にしない（そのまま）
  {
    id: 'e-end-reply',
    emulatedId: 'kashiwa-5',
    title: '終了リプライ名刺',
    startDay: '2026-07-05',
    endDate: '2026-07-31',
    refs: [ref('announce', '5001', 'original'), ref('end', '5002', 'reply')]
  },
  // 告知が quote → そのまま
  {
    id: 'e-quote',
    emulatedId: 'kashiwa-6',
    title: '引用名刺',
    startDay: '2026-07-06',
    endDate: '2026-07-31',
    refs: [ref('announce', '6001', 'quote')]
  },
  // 終了の情報が無く、最後の言及からちょうど 30 日 → ended_at を入れる
  {
    id: 'e-stale-30',
    emulatedId: 'kashiwa-7',
    title: '30日名刺',
    startDay: '2026-07-07',
    refs: [ref('announce', '7001', 'original')],
    lastSeen: at('2026-09-10T14:59:59.000Z')
  },
  // 29 日 → null のまま
  {
    id: 'e-stale-29',
    emulatedId: 'kashiwa-8',
    title: '29日名刺',
    startDay: '2026-07-08',
    refs: [ref('announce', '8001', 'original')],
    lastSeen: at('2026-09-10T15:00:00.000Z')
  },
  // 最後の言及が開始日より前 → 入れない（開始が 30 日未満前なので、終了が分からなくても削除しない）
  {
    id: 'e-before-start',
    emulatedId: 'kashiwa-9',
    title: '前名刺',
    startDay: '2026-09-25',
    refs: [ref('announce', '9001', 'original')],
    lastSeen: at('2026-06-01T00:00:00.000Z')
  },
  // 実終了日がある → 推定しない
  {
    id: 'e-has-ended',
    emulatedId: 'kashiwa-10',
    title: '終了済み名刺',
    startDay: '2026-07-10',
    endedAt: '2026-07-20T00:00:00.000Z',
    refs: [ref('announce', '10001', 'original')],
    lastSeen: at('2026-08-01T00:00:00.000Z')
  },
  // 配布数 1001 → 消す
  {
    id: 'e-over',
    emulatedId: 'kashiwa-11',
    title: '1001名刺',
    startDay: '2026-07-11',
    endDate: '2026-07-31',
    limitedQuantity: 1001,
    refs: [ref('announce', '11001', 'original')]
  },
  // 配布数 1000 → そのまま
  {
    id: 'e-max',
    emulatedId: 'kashiwa-12',
    title: '1000名刺',
    startDay: '2026-07-12',
    endDate: '2026-07-31',
    limitedQuantity: 1000,
    refs: [ref('announce', '12001', 'original')]
  },
  // 削除するイベントには B・C を当てない（終了の情報が無く古い言及・配布数 5000 でも、削除するだけ）
  {
    id: 'e-del-bc',
    emulatedId: 'kashiwa-13',
    title: '削除B C名刺',
    startDay: '2026-07-13',
    limitedQuantity: 5000,
    refs: [ref('announce', '13001', 'reply')],
    lastSeen: at('2026-08-01T00:00:00.000Z')
  },
  // 確認済みは告知がリプライでも触らない（レポートにも載っていない）
  {
    id: 'e-verified',
    emulatedId: 'kashiwa-14',
    title: '確認済み名刺',
    startDay: '2026-07-14',
    verified: true,
    createdAt: '2026-01-13T07:11:25.449Z',
    limitedQuantity: 5000,
    refs: [ref('announce', '14001', 'reply')]
  },
  // 手で作った is_verified=0（レポートに無い）→ 引けないので触らない
  {
    id: 'e-manual',
    emulatedId: 'kashiwa-15',
    title: '手作り名刺',
    startDay: '2026-07-15',
    createdAt: '2026-02-04T14:43:23.980+00:00',
    limitedQuantity: 5000,
    refs: [ref('announce', '15001', 'reply')]
  },
  // ビッカメ娘ではない店舗（biccamera）→ リプライでなくても削除（店舗だけ）
  {
    id: 'e-store',
    emulatedId: 'biccamera-1',
    title: 'ビックカメラ名刺',
    store: 'biccamera',
    startDay: '2026-07-16',
    endDate: '2026-07-31',
    refs: [ref('announce', '16001', 'original')]
  },
  // ビッカメ娘ではない店舗で、告知もリプライ → 削除（両方）
  {
    id: 'e-store-reply',
    emulatedId: 'bicsim-1',
    title: 'シム名刺',
    store: 'bicsim',
    startDay: '2026-07-17',
    endDate: '2026-07-31',
    refs: [ref('announce', '17001', 'reply')]
  },
  // 店舗が理由だが user_events が参照している → 削除しない（変更しない）
  {
    id: 'e-store-referenced',
    emulatedId: 'naisen-1',
    title: '参照ありナイセン名刺',
    store: 'naisen',
    startDay: '2026-07-18',
    refs: [ref('announce', '18001', 'original')]
  },
  // 確認済みは店舗がビッカメ娘でなくても触らない（実データには無いが、不変であることを確かめる）
  {
    id: 'e-store-verified',
    emulatedId: 'biccamera-2',
    title: '確認済みビックカメラ名刺',
    store: 'biccamera',
    startDay: '2026-07-19',
    verified: true,
    createdAt: '2026-01-13T07:11:25.449Z',
    refs: [ref('announce', '19001', 'original')]
  },
  // 手で作った is_verified=0 のビッカメ娘でない店舗 → 引けないので触らない（件数だけ報告する）
  {
    id: 'e-manual-store',
    emulatedId: 'biccamera-3',
    title: '手作りビックカメラ名刺',
    store: 'biccamera',
    startDay: '2026-07-20',
    createdAt: '2026-02-04T14:43:23.980+00:00',
    refs: [ref('announce', '20001', 'original')]
  }
]

/** 投稿 ID → 種類（posts.jsonl） */
export const kinds: Record<string, DetectPostKind> = Object.fromEntries(
  specs.flatMap((spec) => spec.refs.map((row) => [row.id, row.kind] as const))
)

/** レポートに載り、seed --fix が対応を引ける自動作成分（確認済みと手作りを除く） */
export const autoSpecs = specs.filter((spec) => spec.verified !== true && !spec.id.startsWith('e-manual'))

const storeOf = (spec: EventSpec) => (spec.store === undefined ? 'kashiwa' : spec.store)

/** ビッカメ娘ではない店舗（characters.json の is_biccame_musume が false） */
export const NON_BICCAME = ['biccamera', 'bicsim', 'naisen']

export const emulatedEvents = specs.map((spec) => ({
  id: spec.emulatedId,
  store: storeOf(spec),
  item: spec.title,
  category: 'limited_card' as const,
  status: 'end',
  startDate: spec.startDay === undefined ? '2026-07-01' : spec.startDay,
  startUnknown: false,
  firstSeen: at('2026-06-01T00:00:00.000Z'),
  lastSeen: spec.lastSeen === undefined ? at('2026-08-01T00:00:00.000Z') : spec.lastSeen,
  // 言及は参考 URL と同じ投稿（種別ごとに 1 件、古い順）
  posts: spec.refs.map((row) => ({ postId: row.id, status: row.type, index: 0 }))
}))

/** seed が書いたレポート。確認済みと手作りの行は載っていない */
export const reportFor = (generatedAt: string) => ({
  generatedAt,
  events: autoSpecs.map((spec) => ({
    emulatedId: spec.emulatedId,
    store: storeOf(spec),
    startDate: spec.startDay === undefined ? '2026-07-01' : spec.startDay,
    title: spec.title
  }))
})
