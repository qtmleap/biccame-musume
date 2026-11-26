import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { EventCharacterSchema, type EventRequest } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { z } from 'zod'
import { StoredEventRequestSchema, storedJson } from './webhook-job-record'

dayjs.extend(utc)

export type DuplicateScope = { where: string; args: string[]; exact: string; exactArgs: string[] }
type Row = {
  id: string
  title: string
  item: string | null
  candidateJson: string | null
  characterIdsJson: string
  legacy: number
  exact: number
}

/** Exact matches preserve the old behavior, including matching historical references. */
export const duplicateScope = (event: EventRequest, sourceUrl: string, includeNear: boolean): DuplicateScope => {
  const start = toD1DateTime(event.startDate)
  const day = dayjs(event.startDate)
    .utcOffset(9 * 60)
    .startOf('day')
  const today = toD1DateTime(
    dayjs()
      .utcOffset(9 * 60)
      .startOf('day')
  )
  const storeMatches = `EXISTS (SELECT 1 FROM event_stores s WHERE s.event_id=e.id
    AND s.store_key IN (SELECT value FROM json_each(?)))`
  const exact = `(EXISTS (SELECT 1 FROM event_reference_urls r WHERE r.event_id=e.id AND r.url=?)
    OR (e.category=? AND e.start_date=? AND ${storeMatches}))`
  const stores = JSON.stringify(event.stores)
  const exactArgs = [sourceUrl, event.category, start, stores]
  if (!includeNear) return { exact, exactArgs, where: `e.id<>? AND ${exact}`, args: [event.uuid, ...exactArgs] }
  const near = `(e.category=? AND e.ended_at IS NULL AND (e.end_date IS NULL OR e.end_date>=?)
    AND ${storeMatches}
    AND ((e.start_date>=? AND e.start_date<?) OR
      (e.end_date IS NOT NULL AND e.end_date>=? AND e.start_date<=?)))`
  return {
    exact,
    exactArgs,
    where: `e.id<>? AND (${exact} OR ${near})`,
    args: [
      event.uuid,
      ...exactArgs,
      event.category,
      today,
      stores,
      toD1DateTime(day.subtract(1, 'day')),
      toD1DateTime(day.add(2, 'day')),
      start,
      event.endDate === undefined ? start : toD1DateTime(event.endDate)
    ]
  }
}

export const readDuplicateCandidates = async (env: Pick<Bindings, 'DB'>, scope: DuplicateScope) => {
  const rows = await env.DB.prepare(`SELECT e.id,e.title,c.item,c.candidate_json AS candidateJson,
    (SELECT json_group_array(character_id) FROM
      (SELECT character_id FROM event_characters WHERE event_id=e.id ORDER BY character_id)) AS characterIdsJson,
    CASE WHEN json_valid(j.extraction_json) AND json_extract(j.extraction_json,'$.version')='legacy-single' THEN 1 ELSE 0 END AS legacy,
    ${scope.exact} AS exact
    FROM events e LEFT JOIN webhook_event_candidates c ON c.event_id=e.id
    LEFT JOIN webhook_event_jobs j ON j.post_id=c.post_id WHERE ${scope.where}`)
    .bind(...scope.exactArgs, ...scope.args)
    .all<Row>()
  return rows.results.map((row) => {
    const characters = z.array(EventCharacterSchema).safeParse(storedJson(row.characterIdsJson))
    if (!characters.success) throw new Error('Invalid stored event characters')
    const stored = row.candidateJson === null ? null : StoredEventRequestSchema.safeParse(storedJson(row.candidateJson))
    return {
      id: row.id,
      title: row.title,
      item: row.item,
      characters: characters.data,
      candidate: stored?.success ? stored.data : null,
      legacy: row.legacy === 1,
      exact: row.exact === 1
    }
  })
}
