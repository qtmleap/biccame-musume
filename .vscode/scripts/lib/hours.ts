export type HourEntry = {
  type: 'weekday' | 'weekend' | 'holiday' | 'all'
  open_time: string
  close_time: string
  note?: string
}

export type ParsedHours = {
  open_all_year: boolean
  hours: HourEntry[]
}

const WEEKDAY_WEEKEND_PATTERN =
  /平日[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})[^/]*\/[^\d]*土日[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})/

const WEEKDAY_SAT_SUN_PATTERN =
  /平日[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})[^\d]*日曜[^\d]*(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})/

const TIME_RANGE_PATTERN = /(\d{1,2}:\d{2})\s*[～〜~-]\s*(\d{1,2}:\d{2})/

const NOTE_PATTERN = /（[^）]+）/

export const parseHours = (hoursText: string): ParsedHours => {
  const open_all_year = hoursText.includes('年中無休')
  const hours: HourEntry[] = []

  const weekdayWeekendMatch = hoursText.match(WEEKDAY_WEEKEND_PATTERN)
  if (weekdayWeekendMatch) {
    hours.push({ type: 'weekday', open_time: weekdayWeekendMatch[1], close_time: weekdayWeekendMatch[2] })
    hours.push({ type: 'weekend', open_time: weekdayWeekendMatch[3], close_time: weekdayWeekendMatch[4] })
    return { open_all_year, hours }
  }

  const weekdaySatSunMatch = hoursText.match(WEEKDAY_SAT_SUN_PATTERN)
  if (weekdaySatSunMatch) {
    hours.push({ type: 'weekday', open_time: weekdaySatSunMatch[1], close_time: weekdaySatSunMatch[2] })
    hours.push({ type: 'holiday', open_time: weekdaySatSunMatch[3], close_time: weekdaySatSunMatch[4] })
    return { open_all_year, hours }
  }

  const timeMatch = hoursText.match(TIME_RANGE_PATTERN)
  if (timeMatch) {
    const note = hoursText.includes('（') ? hoursText.match(NOTE_PATTERN)?.[0] : undefined
    hours.push({ type: 'all', open_time: timeMatch[1], close_time: timeMatch[2], note })
  }

  return { open_all_year, hours }
}