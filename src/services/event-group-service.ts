import type { Prisma } from '@prisma/client'
import dayjs from 'dayjs'
import { HTTPException } from 'hono/http-exception'
import { getPrisma } from '@/lib/prisma'
import type { EventGroup, EventGroupDetail, EventGroupItemType, EventGroupRequest } from '@/schemas/event-group.dto'
import type { Bindings } from '@/types/bindings'
import { EVENT_LIST_SELECT, transform as transformEvent } from './event-service'
import { getEventsStats } from './me-service'

/**
 * イベントグループ一覧用の select 句。
 */
const EVENT_GROUP_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  itemType: true,
  startDate: true,
  endDate: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { events: true } }
} as const satisfies Prisma.EventGroupSelect

type EventGroupListPayload = Prisma.EventGroupGetPayload<{ select: typeof EVENT_GROUP_LIST_SELECT }>

const transform = (group: EventGroupListPayload): EventGroup => ({
  uuid: group.id,
  title: group.title,
  description: group.description ?? undefined,
  itemType: group.itemType as EventGroupItemType,
  startDate: group.startDate,
  endDate: group.endDate ?? undefined,
  sortOrder: group.sortOrder,
  eventCount: group._count.events,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt
})

/**
 * イベントグループ一覧を取得（sortOrder 昇順、tie-breaker は createdAt 降順）
 */
export const getEventGroups = async (env: Bindings): Promise<EventGroup[]> => {
  const prisma = getPrisma(env)
  const groups = await prisma.eventGroup.findMany({
    select: EVENT_GROUP_LIST_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
  })
  return groups.map(transform)
}

/**
 * イベントグループ詳細 + 紐付くイベント一覧 を ID から取得
 * @param includeUnverified - true の場合は未検証イベントも含む（管理画面用）
 */
export const getEventGroupById = async (
  env: Bindings,
  id: string,
  includeUnverified = false
): Promise<EventGroupDetail> => {
  const prisma = getPrisma(env)
  const group = await prisma.eventGroup.findUnique({
    where: { id },
    select: EVENT_GROUP_LIST_SELECT
  })
  if (group === null) {
    throw new HTTPException(404, { message: 'Not Found' })
  }
  const events = await prisma.event.findMany({
    where: { groupId: group.id, ...(includeUnverified ? {} : { isVerified: true }) },
    select: EVENT_LIST_SELECT,
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }]
  })
  const eventIds = events.map((e) => e.id)
  const stats = await getEventsStats(env, eventIds)
  // 開催日昇順 → 先頭店舗キー昇順（ja ロケール）で安定ソート。同一キャンペーンは
  // タイトルが似通うため、店舗順で並ぶことで一覧の視認性が上がる。
  const transformed = events
    .map((e) => transformEvent(e, stats[e.id]?.interestedCount ?? 0, stats[e.id]?.completedCount ?? 0))
    .sort((a, b) => {
      const dateDiff = a.startDate.getTime() - b.startDate.getTime()
      if (dateDiff !== 0) return dateDiff
      const aStore = a.stores[0] ?? ''
      const bStore = b.stores[0] ?? ''
      return aStore.localeCompare(bStore, 'ja')
    })
  return {
    ...transform(group),
    events: transformed
  }
}

const toGroupDates = (data: EventGroupRequest) => ({
  startDate: dayjs(data.startDate).toDate(),
  endDate: data.endDate ? dayjs(data.endDate).toDate() : null
})

/**
 * イベントグループを新規作成
 * 同一 UUID が存在する場合は既存を返す（冪等性）
 */
export const createEventGroup = async (env: Bindings, data: EventGroupRequest): Promise<EventGroup> => {
  const prisma = getPrisma(env)
  const existing = await prisma.eventGroup.findUnique({
    where: { id: data.uuid },
    select: EVENT_GROUP_LIST_SELECT
  })
  if (existing) {
    return transform(existing)
  }
  const group = await prisma.eventGroup.create({
    data: {
      id: data.uuid,
      title: data.title,
      description: data.description ?? null,
      itemType: data.itemType,
      sortOrder: data.sortOrder,
      ...toGroupDates(data)
    },
    select: EVENT_GROUP_LIST_SELECT
  })
  return transform(group)
}

/**
 * イベントグループを更新
 */
export const updateEventGroup = async (env: Bindings, data: EventGroupRequest): Promise<EventGroup> => {
  const prisma = getPrisma(env)
  const group = await prisma.eventGroup.update({
    where: { id: data.uuid },
    data: {
      title: data.title,
      description: data.description ?? null,
      itemType: data.itemType,
      sortOrder: data.sortOrder,
      ...toGroupDates(data)
    },
    select: EVENT_GROUP_LIST_SELECT
  })
  return transform(group)
}

/**
 * 指定の Event 群を 1 つの EventGroup に一括で紐付ける（または groupId をクリア）
 * @param env - Cloudflare Workers 環境変数
 * @param groupId - 紐付ける EventGroup の UUID。null の場合は対象 Event の所属を解除
 * @param eventIds - 対象の Event UUID 配列
 * @returns 更新件数
 */
export const setEventsGroup = async (
  env: Bindings,
  groupId: string | null,
  eventIds: string[]
): Promise<{ updated: number }> => {
  if (eventIds.length === 0) return { updated: 0 }
  const prisma = getPrisma(env)
  if (groupId !== null) {
    const group = await prisma.eventGroup.findUnique({ where: { id: groupId }, select: { id: true } })
    if (group === null) {
      throw new HTTPException(404, { message: 'Event group not found' })
    }
  }
  const result = await prisma.event.updateMany({
    where: { id: { in: eventIds } },
    data: { groupId }
  })
  return { updated: result.count }
}

/**
 * イベントグループを削除
 * 紐付く Event は schema の onDelete: SetNull により group_id が null になる
 */
export const deleteEventGroup = async (env: Bindings, id: string): Promise<null> => {
  const prisma = getPrisma(env)
  await prisma.eventGroup.delete({ where: { id } })
  return null
}
