import { expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import { sign } from 'hono/jwt'
import authRoutes from '@/api/auth'
import type { Bindings, Variables } from '@/types/bindings'
import { verifyToken } from '@/utils/token'

const env = { ENVIRONMENT: 'local', JWT_SECRET_KEY: 'test-only-session-secret' }
const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()
app.route('/api/auth', authRoutes)
app.get('/api/protected', verifyToken, (c) => c.json({ uid: c.get('jwtPayload').uid }))

// This catches a missing logout route or a cookie that does not expire at path=/.
test('logout_then_protected_api_returns_401', async () => {
  const token = await sign(
    {
      uid: 'account-a',
      exp: Math.floor(Date.now() / 1000) + 3600,
      usr: { email: null, email_verified: false, display_name: null, thumbnail_url: null }
    },
    env.JWT_SECRET_KEY,
    'HS256'
  )
  const cookieJar = new Map([['session', token]])
  const headers = () => ({ Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; ') })
  expect((await app.request('/api/protected', { headers: headers() }, env)).status).toBe(200)

  const response = await app.request('/api/auth/logout', { method: 'POST', headers: headers() }, env)
  expect(response.status).toBe(200)
  const body: unknown = await response.json()
  expect(body).toEqual({ success: true })
  const expiredCookie = response.headers.get('Set-Cookie')
  if (expiredCookie === null) throw new Error('Logout response must expire the session Cookie')
  expect(expiredCookie).toContain('session=')
  expect(expiredCookie).toContain('Path=/')
  expect(expiredCookie).toContain('Max-Age=0')
  expect(expiredCookie).toContain('HttpOnly')
  cookieJar.delete('session')
  expect((await app.request('/api/protected', { headers: headers() }, env)).status).toBe(401)
})

test('logout is idempotent without a session and uses secure cookies outside local', async () => {
  const response = await app.request('/api/auth/logout', { method: 'POST' }, { ...env, ENVIRONMENT: 'production' })
  expect(response.status).toBe(200)
  expect(response.headers.get('Set-Cookie')).toContain('Secure')
})
