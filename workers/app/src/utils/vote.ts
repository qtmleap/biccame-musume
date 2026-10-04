import dayjs from 'dayjs'
import { getJstDateKey, getJstYear, getNextJstMidnight } from '@/utils/jst-date'

/** JST の次の日付（明日0時）を取得する互換ラッパー */
export const getNextJSTDate = (nowIso = dayjs().toISOString()): string => getNextJstMidnight(nowIso)

/** JST の翌日を YYYY-MM-DD で返す。投票済みエラーのレスポンス用 */
export const getNextJSTDateKey = (nowIso = dayjs().toISOString()): string => getJstDateKey(getNextJstMidnight(nowIso))

/** JST 基準の日付キー。投票の 1 日 1 回制限の境界に使う */
export const getJSTDateKey = (nowIso = dayjs().toISOString()): string => getJstDateKey(nowIso)

/** JST 基準の集計年度 */
export const getJSTYear = (nowIso = dayjs().toISOString()): number => getJstYear(nowIso)
