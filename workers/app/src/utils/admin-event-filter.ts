import dayjs from 'dayjs'
import type { Event } from '@/schemas/event.dto'

/**
 * 管理画面のイベント一覧の確認状態フィルタ
 */
export type VerificationFilter = 'all' | 'verified' | 'unverified'

/**
 * 管理画面のイベント一覧が使うステータス (last_day は ongoing として扱う)
 */
type ListStatus = 'upcoming' | 'ongoing' | 'ended'

export type AdminEventFilter = {
  verification: VerificationFilter
  category: Event['category']
  store: string | null
  status: Record<ListStatus, boolean>
}

/**
 * 管理画面の一覧用に開催状況を求める (終了日時の瞬間で判定する)
 */
export const getListStatus = (event: Event, now: dayjs.Dayjs): ListStatus => {
  const end = event.endDate ? dayjs(event.endDate) : null
  if (event.endedAt != null) return 'ended'
  if (end && now.isAfter(end)) return 'ended'
  if (now.isBefore(dayjs(event.startDate))) return 'upcoming'
  return 'ongoing'
}

const matchesVerification = (event: Event, verification: VerificationFilter): boolean => {
  if (verification === 'verified') return event.isVerified
  if (verification === 'unverified') return !event.isVerified
  return true
}

/**
 * 確認状態・カテゴリ・店舗・ステータスの AND で絞り込む (並びは変えない)
 */
export const filterAdminEvents = (events: Event[], filter: AdminEventFilter, now: dayjs.Dayjs): Event[] =>
  events.filter((event) => {
    if (!matchesVerification(event, filter.verification)) return false
    if (event.category !== filter.category) return false
    if (filter.store !== null && !event.stores.some((store) => store === filter.store)) return false
    return filter.status[getListStatus(event, now)]
  })
