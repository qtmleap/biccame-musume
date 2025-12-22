import { Hono } from 'hono'
import votes from './api/vote'

type Bindings = {
  VOTES: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// 投票APIルート
app.route('/api/votes', votes)

// 静的ファイル配信
app.use('*', async (_c, next) => {
  await next()
})

export default app
