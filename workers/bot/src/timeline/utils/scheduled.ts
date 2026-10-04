import type { Dayjs } from 'dayjs'
import type { Bindings } from './bindings'
import { dayjs } from './dayjs'
import { notify } from './post'

// 初期移植ではscheduledTimeへ変更せず、実行時刻とミリ秒の扱いも維持する。
export const getTimelineWindow = (clock: () => Dayjs = dayjs): { since: Dayjs; until: Dayjs } => ({
  since: clock().subtract(5, 'minutes').set('second', 0),
  until: clock().set('second', 0)
})

export const runTimeline = async (env: Bindings): Promise<void> => {
  const { since, until } = getTimelineWindow()
  await notify(env, since, until)
}
