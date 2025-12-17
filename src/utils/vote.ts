import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * JSTの今日の日付を YYYY-MM-DD 形式で取得
 */
export const getJSTDate = (): string => {
  return dayjs().tz('Asia/Tokyo').format('YYYY-MM-DD')
}

/**
 * JSTの次の日付（明日0時）を取得
 */
export const getNextJSTDate = (): string => {
  return dayjs().tz('Asia/Tokyo').add(1, 'day').startOf('day').toISOString()
}

/**
 * JSTの現在の年を取得
 */
export const getJSTYear = (): string => {
  return dayjs().tz('Asia/Tokyo').format('YYYY')
}

/**
 * IPアドレスから投票キーを生成
 * 形式: vote:{year}:{characterId}:{ip}:{jstDate}
 */
export const generateVoteKey = (characterId: string, ip: string): string => {
  const year = getJSTYear()
  const jstDate = getJSTDate()
  return `vote:${year}:${characterId}:${ip}:${jstDate}`
}

/**
 * カウントキーを生成
 * 形式: count:{year}:{characterId}
 */
export const generateCountKey = (characterId: string): string => {
  const year = getJSTYear()
  return `count:${year}:${characterId}`
}
