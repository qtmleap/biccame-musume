import type { EventRequest } from '@biccame/shared/schemas/event.dto'

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
