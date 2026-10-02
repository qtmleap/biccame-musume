import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { getJstDateKey, getNextJstMidnight } from '@/utils/jst-date'

/** JST 午前0時と、休止したタブが再表示されたときに日付を更新する。 */
export const useJstDate = (): string => {
  const [dateKey, setDateKey] = useState(() => getJstDateKey(dayjs().toISOString()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      const nowIso = dayjs().toISOString()
      setDateKey(getJstDateKey(nowIso))
      clearTimeout(timer)
      timer = setTimeout(refresh, dayjs(getNextJstMidnight(nowIso)).diff(dayjs(nowIso)))
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return dateKey
}
