import { type StoreKey, StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { z } from 'zod'

/**
 * 対象ビッカメ娘が空のイベントに、開催店舗の娘（店舗キーがそのまま娘の ID）を明示で書き込むための計画と SQL。
 * DB には触れない。読み取りの SQL と、読んだ行のスキーマもここに置く。
 */

/** 読み取り専用。events の id・title、event_stores の store_key、event_characters の件数だけを読む（投票・ユーザー情報は読まない）。 */
export const READ_EVENTS_SQL =
  'SELECT e.id AS event_id, e.title AS title, s.store_key AS store_key, (SELECT COUNT(*) FROM event_characters c WHERE c.event_id = e.id) AS character_count FROM events e LEFT JOIN event_stores s ON s.event_id = e.id ORDER BY e.id, s.store_key'

export const EventStoreRowSchema = z.object({
  event_id: z.string().nonempty(),
  title: z.string().nonempty(),
  store_key: z.string().nonempty().nullable(),
  character_count: z.number().int().nonnegative()
})
export type EventStoreRow = z.infer<typeof EventStoreRowSchema>

export type BackfillEvent = {
  eventId: string
  title: string
  /** event_stores.store_key の並び（未検証の文字列） */
  storeKeys: readonly string[]
  /** すでに event_characters にある行数 */
  characterCount: number
}

export type SkipReason = 'has-characters' | 'no-stores' | 'no-valid-stores'

export const SKIP_REASONS: readonly SkipReason[] = ['has-characters', 'no-stores', 'no-valid-stores']

export type BackfillInsert = {
  eventId: string
  title: string
  /** 入れる娘。店舗キーの重複なし・昇順 */
  characterIds: readonly StoreKey[]
}

export type BackfillSkip = { eventId: string; title: string; reason: SkipReason }

export type InvalidStoreKey = { eventId: string; title: string; storeKey: string }

export type BackfillPlan = {
  inserts: BackfillInsert[]
  skipped: BackfillSkip[]
  /** StoreKey として不正な店舗キー。書かずに報告する（有効なキーが他にあれば、そのイベントは有効なキーだけ書く） */
  invalidStoreKeys: InvalidStoreKey[]
}

type EventGroup = { title: string; storeKeys: string[]; characterCount: number }

/** JOIN した行（イベント × 店舗）を、イベントごとにまとめる。順序は最初に現れた順。 */
export const groupEventRows = (rows: readonly EventStoreRow[]): BackfillEvent[] => {
  const events = new Map<string, EventGroup>()
  for (const row of rows) {
    const found = events.get(row.event_id)
    const event: EventGroup =
      found === undefined ? { title: row.title, storeKeys: [], characterCount: row.character_count } : found
    if (row.store_key !== null) event.storeKeys.push(row.store_key)
    events.set(row.event_id, event)
  }
  return [...events].map(([eventId, event]) => ({ eventId, ...event }))
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 娘が1件も無いイベントごとに、有効な店舗キーを重複なしで娘の ID として入れる計画を作る。 */
export const planEventCharacterBackfill = (events: readonly BackfillEvent[]): BackfillPlan => {
  const plan: BackfillPlan = { inserts: [], skipped: [], invalidStoreKeys: [] }
  for (const { eventId, title, storeKeys, characterCount } of events) {
    if (characterCount > 0) {
      plan.skipped.push({ eventId, title, reason: 'has-characters' })
      continue
    }
    if (storeKeys.length === 0) {
      plan.skipped.push({ eventId, title, reason: 'no-stores' })
      continue
    }
    const valid = new Set<StoreKey>()
    for (const storeKey of new Set(storeKeys)) {
      const parsed = StoreKeySchema.safeParse(storeKey)
      if (parsed.success) valid.add(parsed.data)
      else plan.invalidStoreKeys.push({ eventId, title, storeKey })
    }
    if (valid.size === 0) {
      plan.skipped.push({ eventId, title, reason: 'no-valid-stores' })
      continue
    }
    plan.inserts.push({ eventId, title, characterIds: [...valid].sort(compareText) })
  }
  return plan
}

export const countInsertRows = (plan: Pick<BackfillPlan, 'inserts'>) =>
  plan.inserts.reduce((total, insert) => total + insert.characterIds.length, 0)

export const countSkipped = (plan: Pick<BackfillPlan, 'skipped'>): Record<SkipReason, number> => ({
  'has-characters': plan.skipped.filter((skip) => skip.reason === 'has-characters').length,
  'no-stores': plan.skipped.filter((skip) => skip.reason === 'no-stores').length,
  'no-valid-stores': plan.skipped.filter((skip) => skip.reason === 'no-valid-stores').length
})

export type SqlContext = {
  /** created_at / updated_at に書く値（toD1DateTime の形式） */
  now: string
  newId: () => string
}

const SAFE_TEXT = /^[A-Za-z0-9:_.-]+$/
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+00:00$/

/** SQL に埋め込む文字列は、UUID・店舗キー・日時に使う文字だけを許す（本番の値を連結するので、入れ物の外に出さない）。 */
const literal = (value: string) => {
  if (!SAFE_TEXT.test(value) && !DATETIME.test(value)) throw new Error(`Unsafe value for SQL literal: ${value}`)
  return `'${value}'`
}

/**
 * イベントごとに 1 文（1 行）。ガードの NOT EXISTS は 1 文に 1 回だけ書き、そのイベントの娘をまとめて入れる。
 * 娘ごとに文を分けると、最初の INSERT のあとで残りのガードが偽になり、複数店舗のイベントに 1 件しか入らない。
 * 1 文は全部入るか全部入らないかなので、途中で止まっても半端なイベントは残らず、再実行できる。
 * events には触れない（updated_at・character_id は変えない）。
 */
export const buildBackfillStatements = (inserts: readonly BackfillInsert[], { now, newId }: SqlContext): string[] =>
  inserts.map(({ eventId, characterIds }) => {
    const event = literal(eventId)
    const timestamp = literal(now)
    const values = characterIds.map((characterId) => `(${literal(newId())},${literal(characterId)})`).join(',')
    return (
      `INSERT INTO event_characters (id,event_id,character_id,created_at,updated_at) ` +
      `SELECT v.column1,${event},v.column2,${timestamp},${timestamp} FROM (VALUES ${values}) AS v ` +
      `WHERE NOT EXISTS (SELECT 1 FROM event_characters WHERE event_id=${event}) ` +
      `ON CONFLICT(event_id,character_id) DO NOTHING;`
    )
  })

const SAMPLE_SIZE = 5

/** dry-run と apply 前に出す報告。題名と店舗→娘のサンプルだけを含み、それ以外のイベントの列は読まない・出さない。 */
export const describePlan = (plan: BackfillPlan, totalEvents: number): string[] => {
  const skipped = countSkipped(plan)
  return [
    `Events read: ${totalEvents}`,
    `Targets (no characters, valid stores): ${plan.inserts.length}`,
    `Rows to insert into event_characters: ${countInsertRows(plan)}`,
    `Skipped: ${plan.skipped.length}`,
    ...SKIP_REASONS.map((reason) => `  ${reason}: ${skipped[reason]}`),
    `Invalid store keys (not written): ${plan.invalidStoreKeys.length}`,
    ...plan.invalidStoreKeys.map(
      (item) => `  ${item.eventId} "${item.title}" store_key=${JSON.stringify(item.storeKey)}`
    ),
    `Sample (first ${Math.min(SAMPLE_SIZE, plan.inserts.length)}):`,
    ...plan.inserts
      .slice(0, SAMPLE_SIZE)
      .map((item) => `  "${item.title}": ${item.characterIds.map((id) => `${id}->${id}`).join(', ')}`)
  ]
}
