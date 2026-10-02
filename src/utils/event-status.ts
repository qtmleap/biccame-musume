import dayjs from 'dayjs'
import type { EventStatus } from '@/schemas/event.dto'
import { getJstDateKey } from '@/utils/jst-date'

type EventDates = {
  startDate: string | Date
  endDate?: string | Date | null
  endedAt?: string | Date | null
}

/** 日付単位の開催状況をサーバーとUIで共通計算する。終了日はJST終日有効。 */
export const calculateEventStatus = (event: EventDates, nowIso: string): { status: EventStatus; daysUntil: number } => {
  const now = dayjs.utc(getJstDateKey(nowIso))
  const start = dayjs.utc(getJstDateKey(dayjs(event.startDate).toISOString()))
  const end = event.endDate ? dayjs.utc(getJstDateKey(dayjs(event.endDate).toISOString())) : null

  if (event.endedAt != null) return { status: 'ended', daysUntil: 0 }
  if (now.isBefore(start)) return { status: 'upcoming', daysUntil: start.diff(now, 'day') }
  if (end && now.isAfter(end)) return { status: 'ended', daysUntil: 0 }
  if (end && now.isSame(end)) return { status: 'last_day', daysUntil: 0 }
  return { status: 'ongoing', daysUntil: end ? end.diff(now, 'day') : 0 }
}
