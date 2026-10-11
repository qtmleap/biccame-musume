import holiday_jp from '@holiday-jp/holiday_jp'

/**
 * 指定した年月日が日本の祝日であれば祝日名を返す
 */
export const getHolidayName = (year: number, month: number, day: number): string | null => {
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const holiday = (holiday_jp.holidays as Record<string, { name: string }>)[key]
  return holiday?.name ?? null
}
