import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import auth from '../../workers/app/src/api/auth'
import { isAllowedOrigin } from '../../workers/app/src/lib/allowed-origin'
import type { Bindings, Variables } from '../../workers/app/src/types/bindings'
import { getToken, verifyToken } from '../../workers/app/src/utils/token'

// Only the real auth/session boundary is exposed. No AI, remote KV, DO or mutations exist here.
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('/api/*', csrf({ origin: (origin, c) => isAllowedOrigin(origin, c.env) }))
app.route('/api/auth', auth)
app.get('/api/session', verifyToken, async (c) => {
  const uid = getToken(c)
  const user = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(uid).first()
  return c.json({ uid, user })
})
app.get('/health', (c) => c.json({ environment: c.env.ENVIRONMENT, project: c.env.FIREBASE_PROJECT_ID }))
export default app
