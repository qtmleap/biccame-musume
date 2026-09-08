import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

const JST = 'Asia/Tokyo'

/**
 * JST の次の日付（明日0時）を取得
 */
export const getNextJSTDate = (): string => {
  return dayjs().tz(JST).add(1, 'day').startOf('day').toISOString()
}

/**
 * JST の翌日を YYYY-MM-DD で返す。投票済みエラーのレスポンス用
 */
export const getNextJSTDateKey = (): string => {
  return dayjs().tz(JST).add(1, 'day').format('YYYY-MM-DD')
}

/**
 * JST 基準の日付キー（YYYY-MM-DD）。投票の 1 日 1 回制限の境界に使う
 */
export const getJSTDateKey = (): string => {
  return dayjs().tz(JST).format('YYYY-MM-DD')
}

/**
 * JST 基準の年。集計スコープが UTC 年だと元日の 0〜9 時が前年に入る
 */
export const getJSTYear = (): number => {
  return dayjs().tz(JST).year()
}
