import { Prisma } from '@api/db/generated/prisma/client'
import { getPrisma } from '@api/db/prisma'
import { saveAtomicManualEvent, usesAtomicEventSave } from '@api/services/event-service-atomic'
import { EVENT_DETAIL_SELECT, transformDetail } from '@api/services/event-service-model'
import {
  toCharactersCreate,
  toConditionsCreate,
  toEventDates,
  toReferenceUrlsCreate,
  toStoresCreate
} from '@api/services/event-service-payload'
import type { Bindings } from '@api/types/bindings'
import type { EventDetail, EventRequest } from '@biccame/shared/schemas/event.dto'

/**
 * 新規イベントを作成
 * 同一UUIDが存在する場合は既存イベントを返す（冪等性保証）
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント作成リクエストデータ
 * @returns イベント情報と、この呼び出しで新規作成したかどうか
 */
export const createEvent = async (
  env: Bindings,
  data: EventRequest
): Promise<{ event: EventDetail; created: boolean }> => {
  if (usesAtomicEventSave(env, data)) return saveAtomicManualEvent(env, data, 'created')
  const prisma = getPrisma(env)

  const existingEvent = await prisma.event.findUnique({
    where: { id: data.uuid },
    select: EVENT_DETAIL_SELECT
  })

  if (existingEvent) {
    return { event: transformDetail(existingEvent), created: false }
  }

  try {
    const event = await prisma.event.create({
      data: {
        id: data.uuid,
        category: data.category,
        title: data.title,
        limitedQuantity: data.limitedQuantity,
        ...toEventDates(data),
        isVerified: data.isVerified ?? false,
        isPreliminary: data.isPreliminary ?? false,
        groupId: data.groupId ?? null,
        characterId: null,
        characters: { create: toCharactersCreate(data) },
        conditions: { create: toConditionsCreate(data, false) },
        referenceUrls: { create: toReferenceUrlsCreate(data, false) },
        stores: { create: toStoresCreate(data) }
      },
      select: EVENT_DETAIL_SELECT
    })
    return { event: transformDetail(event), created: true }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // 最初の照会後に別リクエストが同じUUIDを作成した場合も既存行を返す。
      const existingEvent = await prisma.event.findUnique({
        where: { id: data.uuid },
        select: EVENT_DETAIL_SELECT
      })
      if (existingEvent) return { event: transformDetail(existingEvent), created: false }
    }
    throw error
  }
}

/**
 * 既存イベントを更新
 * 関連データ（conditions, referenceUrls, stores）は全て置換される
 * @param env - Cloudflare Workers環境変数
 * @param data - イベント更新リクエストデータ（uuidが必須）
 * @returns 更新されたイベント情報
 */
export const updateEvent = async (env: Bindings, data: EventRequest): Promise<EventDetail> => {
  if (usesAtomicEventSave(env, data)) return (await saveAtomicManualEvent(env, data, 'updated')).event
  const prisma = getPrisma(env)

  const event = await prisma.event.update({
    where: { id: data.uuid },
    data: {
      category: data.category,
      title: data.title,
      limitedQuantity: data.limitedQuantity,
      ...toEventDates(data),
      isVerified: data.isVerified,
      isPreliminary: data.isPreliminary,
      groupId: data.groupId ?? null,
      characterId: null,
      characters: { deleteMany: {}, create: toCharactersCreate(data) },
      conditions: { deleteMany: {}, create: toConditionsCreate(data, true) },
      referenceUrls: { deleteMany: {}, create: toReferenceUrlsCreate(data, true) },
      stores: { deleteMany: {}, create: toStoresCreate(data) }
    },
    select: EVENT_DETAIL_SELECT
  })

  return transformDetail(event)
}

/**
 * イベントを削除
 * 関連データ（conditions, referenceUrls, stores）もカスケード削除される
 * @param env - Cloudflare Workers環境変数
 * @param id - 削除するイベントのUUID
 * @returns null
 */
export const deleteEvent = async (env: Bindings, id: string): Promise<null> => {
  const prisma = getPrisma(env)
  await prisma.event.delete({ where: { id: id } })
  return null
}
