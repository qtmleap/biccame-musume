import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * JSTの次の日付（明日0時）を取得
 */
export const getNextJSTDate = (): string => {
  return dayjs().add(1, 'day').startOf('day').toISOString()
}
