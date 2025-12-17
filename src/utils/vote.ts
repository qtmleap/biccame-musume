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
 * IPアドレスから投票キーを生成
 * 形式: vote:{characterId}:{ip}:{jstDate}
 */
export const generateVoteKey = (characterId: string, ip: string): string => {
  const jstDate = getJSTDate()
  return `vote:${characterId}:${ip}:${jstDate}`
}

/**
 * カウントキーを生成
 * 形式: count:{characterId}
 */
export const generateCountKey = (characterId: string): string => {
  return `count:${characterId}`
}
