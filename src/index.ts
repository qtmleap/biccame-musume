import { Hono } from 'hono'
import events from './api/event'
import votes from './api/vote'
import type { Bindings, Variables } from './types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// イベント管理APIルート
app.route('/api/events', events)

// 投票APIルート
app.route('/api/votes', votes)

// 静的ファイル配信
app.use('*', async (_c, next) => {
  await next()
})

export default app
