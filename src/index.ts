import { Hono } from 'hono'
import { voteRoutes } from './routes/vote'

type Bindings = {
  VOTES: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// 投票APIルート
app.route('/api/votes', voteRoutes)

// 静的ファイル配信
app.use('*', async (_c, next) => {
  await next()
})

app.use('*', async (_c, next) => {
  await next()
})

export default app
