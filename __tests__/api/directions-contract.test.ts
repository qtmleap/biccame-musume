import { expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import directions from '@/api/direction'
import { RouteResponseSchema } from '@/schemas/route.dto'
import type { Bindings, Variables } from '@/types/bindings'

const leg = { from: '店舗A', to: '店舗B', fromStation: '東京', toStation: '大阪' }
const answer = {
  ...leg,
  routes: [{ operator: 'JR', line: '東海道', from: '東京', to: '大阪', duration: 150 }],
  duration: 150,
  transfers: 0
}
const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()
app.route('/api/directions', directions)
const request = (result: unknown, ai = true) =>
  app.request(
    '/api/directions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.8' },
      body: JSON.stringify({ legs: [leg] })
    },
    {
      ENVIRONMENT: 'prod',
      AI: ai ? { run: async () => ({ response: result }) } : undefined,
      DIRECTIONS_RATE_LIMITER: { limit: async () => ({ success: true }) }
    } as unknown as Bindings
  )

test('route_response_union_accepts_unavailable', () => {
  expect(RouteResponseSchema.safeParse({ status: 'unavailable', reason: 'generation_failed' }).success).toBe(true)
  expect(RouteResponseSchema.safeParse({ status: 'estimated', legs: [] }).success).toBe(false)
})
for (const [name, legs] of Object.entries({
  station: [{ ...answer, toStation: '京都' }],
  store: [{ ...answer, from: '別店舗' }],
  count: [answer, answer],
  empty: [],
  negativeTotal: [{ ...answer, duration: -1 }],
  negativeSegment: [{ ...answer, routes: [{ ...answer.routes[0], duration: -1 }] }],
  segmentEndpoint: [{ ...answer, routes: [{ ...answer.routes[0], to: '京都' }] }]
}))
  test(`mismatched_ai_legs_are_unavailable: ${name}`, async () => {
    const payload: unknown = await (await request({ legs })).json()
    expect(payload).toEqual({ status: 'unavailable', reason: 'generation_failed' })
  })
test('matching_ai_legs_are_estimated', async () => {
  const payload: unknown = await (await request({ legs: [answer] })).json()
  expect(payload).toEqual({ status: 'estimated', legs: [answer] })
})
test('missing_ai_is_unavailable_instead_of_unrelated_local_mock', async () => {
  const payload: unknown = await (await request(null, false)).json()
  expect(payload).toEqual({ status: 'unavailable', reason: 'generation_failed' })
})
