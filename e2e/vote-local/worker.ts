import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import votes from '@api/routes/vote'
import { isAllowedOrigin } from '@api/lib/allowed-origin'
import type { Bindings, Variables } from '@api/types/bindings'

// The production vote route and SQL Durable Object run only against disposable local bindings.
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('/api/*', csrf({ origin: (origin, c) => isAllowedOrigin(origin, c.env) }))
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ message: error.message }, error.status)
  console.error(error)
  return c.json({ message: 'Unknown Error' }, 500)
})
app.route('/api/votes', votes)
app.get('/health', (c) => c.json({ environment: c.env.ENVIRONMENT, bypass: c.env.VOTE_LIMIT_BYPASS }))

export { VoteCounterDO } from '@api/durable-objects/vote-counter'
export default app
