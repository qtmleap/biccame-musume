import type { Bindings } from '@api/types/bindings'
import { toD1DateTime } from '@biccame/shared/domain/d1-datetime'
import { EventCharacterSchema, type EventRequest } from '@biccame/shared/schemas/event.dto'
import { z } from 'zod'
import { StoredEventRequestSchema, storedJson } from './webhook-job-record'

export const webhookItemIdentity = (item: string) =>
  item
    .normalize('NFKC')
    .replace(/キーホルダ[―−ｰ]/g, 'キーホルダー')
    .replace(/\s+/g, '')
export const webhookConditionIdentity = (event: EventRequest) =>
  JSON.stringify(
    event.conditions
      .map(({ type, purchaseAmount, chargeAmount, quantity }) => [type, purchaseAmount, chargeAmount, quantity])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  )

export const duplicateWebhookEvents = async (env: Bindings, event: EventRequest, sourceUrl: string, item?: string) => {
  const placeholders = event.stores.map(() => '?').join(',')
  const rows = await env.DB.prepare(`SELECT e.id,c.item,c.candidate_json AS candidateJson,
    (SELECT json_group_array(character_id) FROM
      (SELECT character_id FROM event_characters WHERE event_id=e.id ORDER BY character_id)) AS characterIdsJson,
    CASE WHEN json_valid(j.extraction_json) AND json_extract(j.extraction_json,'$.version')='legacy-single' THEN 1 ELSE 0 END AS legacy
    FROM events e LEFT JOIN webhook_event_candidates c ON c.event_id=e.id
    LEFT JOIN webhook_event_jobs j ON j.post_id=c.post_id WHERE e.id<>? AND (
    EXISTS (SELECT 1 FROM event_reference_urls r WHERE r.event_id=e.id AND r.url=?) OR
    (e.category=? AND e.start_date=? AND EXISTS (SELECT 1 FROM event_stores s WHERE s.event_id=e.id AND s.store_key IN (${placeholders}))))`)
    .bind(event.uuid, sourceUrl, event.category, toD1DateTime(event.startDate), ...event.stores)
    .all<{ id: string; item: string | null; candidateJson: string | null; characterIdsJson: string; legacy: number }>()
  return [
    ...new Set(
      rows.results
        .filter((row) => {
          const characterIds = z.array(EventCharacterSchema).safeParse(storedJson(row.characterIdsJson))
          if (!characterIds.success) throw new Error('Invalid stored event characters')
          // 旧移行イベントの未判定対象だけは、重複登録を避けるため保守的に照合する。
          if (
            !(row.legacy === 1 && characterIds.data.length === 0) &&
            characterIds.data.slice().sort().join(',') !== [...new Set(event.characterIds)].sort().join(',')
          )
            return false
          if (item === undefined || row.item === null) return true
          const stored =
            row.candidateJson === null ? undefined : StoredEventRequestSchema.safeParse(storedJson(row.candidateJson))
          if (stored === undefined || !stored.success)
            return (
              row.legacy === 1 ||
              row.item === '既存配布物' ||
              webhookItemIdentity(row.item) === webhookItemIdentity(item)
            )
          // 旧形式のitemは生成タイトルであり、抽出名とは一致しない。移行の印を持つ行だけは項目の一致で照合する。
          return (
            (row.legacy === 1 || webhookItemIdentity(row.item) === webhookItemIdentity(item)) &&
            stored.data.category === event.category &&
            stored.data.startDate.slice(0, 10) === event.startDate.slice(0, 10) &&
            stored.data.stores.slice().sort().join(',') === event.stores.slice().sort().join(',') &&
            webhookConditionIdentity(stored.data) === webhookConditionIdentity(event)
          )
        })
        .map((row) => row.id)
    )
  ]
}
