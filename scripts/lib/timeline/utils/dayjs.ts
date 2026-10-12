import _dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

_dayjs.extend(utc)
_dayjs.extend(timezone)

// Asia/Tokyoをデフォルトとするラッパー
export const dayjs = (...args: Parameters<typeof _dayjs>) => {
  return _dayjs(...args).tz('Asia/Tokyo')
}
