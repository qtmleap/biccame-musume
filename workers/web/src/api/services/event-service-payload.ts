import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'

/**
 * EventRequest の日付フィールドを Prisma 用の Date / null に変換
 */
export const toEventDates = (data: EventRequest) => ({
  startDate: dayjs(data.startDate).toDate(),
  endDate: data.endDate ? dayjs(data.endDate).toDate() : null,
  endedAt: data.endedAt ? dayjs(data.endedAt).toDate() : null
})

/**
 * 関連レコードの nested create ペイロードを組み立てる
 * `useClientId=true` のとき client から渡された UUID を id として採用 (update 時の挙動)、
 * `false` のとき Prisma の @default(uuid()) に任せる (create 時の挙動)
 */
export const toConditionsCreate = (data: EventRequest, useClientId: boolean) =>
  data.conditions.map((c) => ({
    ...(useClientId ? { id: c.uuid } : {}),
    type: c.type,
    purchaseAmount: c.purchaseAmount,
    chargeAmount: c.chargeAmount,
    quantity: c.quantity
  }))

export const toReferenceUrlsCreate = (data: EventRequest, useClientId: boolean) =>
  (data.referenceUrls ?? []).map((r) => ({
    ...(useClientId ? { id: r.uuid } : {}),
    type: r.type,
    url: r.url
  }))

export const toStoresCreate = (data: EventRequest) => data.stores.map((storeKey) => ({ storeKey }))
export const toCharactersCreate = (data: EventRequest) =>
  [...new Set(data.characterIds)].map((characterId) => ({ characterId }))
