import { Hono } from 'hono'
import events from './api/event'
import votes from './api/vote'

type Bindings = {
  VOTES: KVNamespace
  BICCAME_MUSUME_EVENTS: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// イベント管理APIルート
app.route('/api/events', events)

// 投票APIルート
app.route('/api/votes', votes)

// 静的ファイル配信
app.use('*', async (_c, next) => {
  await next()
})

export default app
