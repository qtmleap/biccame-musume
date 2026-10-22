import type { Prisma } from '@api/db/generated/prisma/client'
import { calculateEventStatus } from '@biccame/shared/domain/event-status'
import type { CommentResponse } from '@biccame/shared/schemas/comment.dto'
import {
  type Event,
  type EventCategory,
  EventCharacterSchema,
  type EventConditionType,
  type EventDetail,
  type ReferenceUrlType
} from '@biccame/shared/schemas/event.dto'
import type { StoreKey } from '@biccame/shared/schemas/store.dto'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { z } from 'zod'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Tokyo')

/**
 * PrismaのイベントモデルをAPIレスポンス用のEvent型に変換
 * @param event - Prismaから取得した生のイベントデータ
 * @param interestedCount - 興味ありカウント（オプション）
 * @param completedCount - 達成カウント（オプション）
 * @returns APIレスポンス用のEvent型オブジェクト
 */
/**
 * イベント一覧用の select 句。
 * transform() で実際に参照する列のみ取得して D1 のシリアライズコストを抑える。
 */
export const EVENT_LIST_SELECT = {
  id: true,
  category: true,
  title: true,
  limitedQuantity: true,
  startDate: true,
  endDate: true,
  endedAt: true,
  isVerified: true,
  isPreliminary: true,
  groupId: true,
  characters: { select: { characterId: true }, orderBy: { characterId: 'asc' } },
  createdAt: true,
  updatedAt: true,
  conditions: {
    select: { id: true, type: true, purchaseAmount: true, chargeAmount: true, quantity: true }
  },
  stores: {
    select: { storeKey: true }
  }
} as const satisfies Prisma.EventSelect

/**
 * イベント詳細用の select 句。 EVENT_LIST_SELECT に referenceUrls / comments を加える。
 */
export const EVENT_DETAIL_SELECT = {
  ...EVENT_LIST_SELECT,
  referenceUrls: {
    select: { id: true, type: true, url: true }
  },
  comments: {
    select: { id: true, nickname: true, body: true, createdAt: true, userId: true, deletedAt: true }
  }
} as const satisfies Prisma.EventSelect

export type EventListPayload = Prisma.EventGetPayload<{ select: typeof EVENT_LIST_SELECT }>

type EventDetailPayload = Prisma.EventGetPayload<{ select: typeof EVENT_DETAIL_SELECT }>

export const transform = (event: EventListPayload, interestedCount = 0, completedCount = 0): Event => {
  const { status, daysUntil } = calculateEventStatus(event, dayjs().toISOString())
  const characterIds = z
    .array(EventCharacterSchema)
    .safeParse(event.characters.map((character) => character.characterId))
  if (!characterIds.success) throw new Error('Invalid stored event characters')
  return {
    uuid: event.id,
    category: event.category as EventCategory,
    title: event.title,
    limitedQuantity: event.limitedQuantity ?? undefined,
    startDate: event.startDate,
    endDate: event.endDate ?? undefined,
    endedAt: event.endedAt ?? undefined,
    isVerified: event.isVerified,
    isPreliminary: event.isPreliminary,
    groupId: event.groupId ?? undefined,
    characterIds: characterIds.data,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    conditions: event.conditions.map((c) => ({
      uuid: c.id,
      type: c.type as EventConditionType,
      purchaseAmount: c.purchaseAmount ?? undefined,
      chargeAmount: c.chargeAmount === null ? undefined : c.chargeAmount,
      quantity: c.quantity ?? undefined
    })),
    stores: event.stores.map((s) => s.storeKey as StoreKey),
    status,
    daysUntil,
    interestedCount,
    completedCount
  }
}

// userId はレスポンスに含めない (他ユーザーの Firebase uid を公開しないため、ログイン投稿かの boolean のみ返す)
const toCommentResponse = (comment: {
  id: string
  nickname: string
  body: string
  createdAt: Date
  userId: string | null
}): CommentResponse => ({
  id: comment.id,
  characterId: comment.nickname,
  body: comment.body,
  createdAt: comment.createdAt.toISOString(),
  verified: comment.userId !== null
})

export const transformDetail = (event: EventDetailPayload, interestedCount = 0, completedCount = 0): EventDetail => ({
  ...transform(event, interestedCount, completedCount),
  referenceUrls: event.referenceUrls.map((r) => ({
    uuid: r.id,
    type: r.type as ReferenceUrlType,
    url: r.url
  })),
  comments: event.comments
    .filter((c) => c.deletedAt === null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(toCommentResponse)
})
