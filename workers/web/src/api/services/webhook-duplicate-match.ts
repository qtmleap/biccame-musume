import type { Bindings } from '@api/types/bindings'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { duplicateScope, readDuplicateCandidates } from './webhook-duplicate-candidates'
import { webhookConditionIdentity, webhookItemIdentity } from './webhook-event-identity'

type Existing = Awaited<ReturnType<typeof readDuplicateCandidates>>[number]
const identity = (values: readonly string[]) => [...new Set(values)].sort().join(',')

const exactDuplicate = (row: Existing, event: EventRequest, item: string | undefined) => {
  if (!(row.legacy && row.characters.length === 0) && identity(row.characters) !== identity(event.characterIds))
    return false
  if (item === undefined || row.item === null) return true
  const sameItem = webhookItemIdentity(row.item) === webhookItemIdentity(item)
  if (row.candidate === null) return row.legacy || row.item === '既存配布物' || sameItem
  return (
    (row.legacy || sameItem) &&
    row.candidate.category === event.category &&
    row.candidate.startDate.slice(0, 10) === event.startDate.slice(0, 10) &&
    identity(row.candidate.stores) === identity(event.stores) &&
    webhookConditionIdentity(row.candidate) === webhookConditionIdentity(event)
  )
}

/** 「全員」などの一般的な配布条件の一致だけでは再告知とみなさない。 */
const nearDuplicate = (row: Existing, event: EventRequest, item: string | undefined) => {
  if (item === undefined) return false
  if (
    row.characters.length > 0 &&
    event.characterIds.length > 0 &&
    !row.characters.some((id) => event.characterIds.includes(id))
  )
    return false
  const name = webhookItemIdentity(row.legacy || row.item === null ? row.title : row.item)
  return name.length > 0 && name === webhookItemIdentity(item)
}

export const inspectWebhookDuplicates = async (
  env: Pick<Bindings, 'DB'>,
  event: EventRequest,
  sourceUrl: string,
  item?: string,
  includeNear = true
) => {
  const scope = duplicateScope(event, sourceUrl, includeNear)
  const rows = await readDuplicateCandidates(env, scope)
  const ids = (list: Existing[]) => [...new Set(list.map((row) => row.id))]
  return {
    scope,
    observed: ids(rows),
    duplicates: ids(
      rows.filter((row) => (row.exact ? exactDuplicate(row, event, item) : nearDuplicate(row, event, item)))
    )
  }
}

export const duplicateWebhookEvents = async (
  env: Pick<Bindings, 'DB'>,
  event: EventRequest,
  sourceUrl: string,
  item?: string,
  includeNear = true
) => (await inspectWebhookDuplicates(env, event, sourceUrl, item, includeNear)).duplicates

export const duplicateReasons = (eventIds: readonly string[]) => eventIds.map((id) => `possible_duplicate:${id}`)
