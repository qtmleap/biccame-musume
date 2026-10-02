import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

// JST は夏時間がないため、端末のタイムゾーンに依存しない固定オフセットを使う。
const inJst = (nowIso: string) => dayjs.utc(nowIso).utcOffset(9 * 60)

export const getJstDateKey = (nowIso: string): string => inJst(nowIso).format('YYYY-MM-DD')

export const getJstYear = (nowIso: string): number => inJst(nowIso).year()

export const getNextJstMidnight = (nowIso: string): string => inJst(nowIso).add(1, 'day').startOf('day').toISOString()
