import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { ipCheck } from '@/middleware/ip-check'
import { type Leg, RouteEndpointResponseSchema, RouteRequestSchema, RouteResponseSchema } from '@/schemas/route.dto'
import type { Bindings, Variables } from '@/types/bindings'

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>({
  defaultHook: (result, c) => {
    if (!result.success)
      return c.json({ message: '駅名・店舗名は100文字以内、経路区間は1〜5件で入力してください。' }, 400)
  }
})

const MAX_BODY_BYTES = 8192
const CACHE_SECONDS = 600
const ErrorSchema = z.object({ message: z.string().nonempty() })

// Read actual stream bytes, including unknown fields and padding, before the JSON validator.
// Content-Length is client controlled and must not be used to skip this check.
app.use('*', async (c, next) => {
  if (c.req.method !== 'POST') return next()
  const reader = c.req.raw.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_BODY_BYTES) {
          void reader.cancel()
          throw new HTTPException(413, { message: 'リクエスト本文は8KiB以内にしてください。' })
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    c.req.bodyCache.json = Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    throw new HTTPException(400, { message: 'JSON形式のリクエストを送信してください。' })
  }
  await next()
})
app.use('*', ipCheck)

const normalizeLegs = (legs: Leg[]): Leg[] =>
  legs.map((leg) => ({
    from: leg.from.trim().normalize('NFC'),
    to: leg.to.trim().normalize('NFC'),
    fromStation: leg.fromStation.trim().normalize('NFC'),
    toStation: leg.toStation.trim().normalize('NFC')
  }))

const routeCache = async (url: string, legs: Leg[]) => {
  if (typeof caches === 'undefined') return undefined
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(legs)))
  const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return {
    cache: await caches.open('directions-v1'),
    key: new Request(new URL(`/__directions-cache/v1/${digest}`, url), { method: 'GET' })
  }
}

/**
 * LLMに経路を推測させるプロンプトを生成
 */
const buildPrompt = (legs: Leg[]) => {
  const legDescriptions = legs
    .map((leg, i) => `${i + 1}. ${leg.from}（${leg.fromStation}）→ ${leg.to}（${leg.toStation}）`)
    .join('\n')

  return [
    'あなたは日本の鉄道路線に詳しい専門家です。',
    '以下の駅間の移動について、利用する路線と各区間の情報を回答してください。',
    '',
    '回答に含めるパラメータ:',
    '- from: 出発店舗名（そのまま返してください）',
    '- to: 到着店舗名（そのまま返してください）',
    '- fromStation: 出発駅名（そのまま返してください）',
    '- toStation: 到着駅名（そのまま返してください）',
    '- routes: 利用する路線区間の配列。各区間には以下を含む:',
    '  - operator: 経営母体（例: JR西日本、近鉄、大阪メトロ、阪急電鉄、京阪電気鉄道）',
    '  - line: 路線名（例: 京都線、奈良線、御堂筋線、神戸線、京阪本線）',
    '  - from: 乗車駅',
    '  - to: 下車駅',
    '  - duration: その区間の所要時間（分単位）',
    '- duration: 総所要時間（分単位の数値）',
    '- transfers: 乗り換え回数',
    '',
    legDescriptions
  ].join('\n')
}

/**
 * モックデータ（ローカル開発用）
 */
const mockLegs = [
  {
    from: 'たかつきたん',
    to: 'なんばたん',
    fromStation: '高槻',
    toStation: 'なんば',
    routes: [
      {
        operator: 'JR西日本',
        line: 'JR京都線',
        from: '高槻',
        to: '大阪',
        duration: 30
      },
      {
        operator: '大阪メトロ',
        line: '御堂筋線',
        from: '大阪',
        to: 'なんば',
        duration: 10
      }
    ],
    duration: 40,
    transfers: 1
  },
  {
    from: 'なんばたん',
    to: 'あべのたん',
    fromStation: 'なんば',
    toStation: '天王寺',
    routes: [
      {
        operator: '大阪メトロ',
        line: '御堂筋線',
        from: 'なんば',
        to: '天王寺',
        duration: 10
      }
    ],
    duration: 10,
    transfers: 0
  },
  {
    from: 'あべのたん',
    to: '八尾たん',
    fromStation: '天王寺',
    toStation: '近鉄八尾',
    routes: [
      {
        operator: '近鉄',
        line: '奈良線',
        from: '天王寺',
        to: '近鉄八尾',
        duration: 20
      }
    ],
    duration: 20,
    transfers: 0
  }
]

/**
 * POST /api/directions - 経路情報をLLMで生成
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    request: {
      body: {
        content: {
          'application/json': {
            schema: RouteRequestSchema
          }
        }
      }
    },
    responses: {
      400: { content: { 'application/json': { schema: ErrorSchema } }, description: '入力形式・文字数・区間数が不正' },
      403: { content: { 'application/json': { schema: ErrorSchema } }, description: 'クライアントIPを確認できない' },
      413: { content: { 'application/json': { schema: ErrorSchema } }, description: '本文が8KiBを超過' },
      429: {
        content: { 'application/json': { schema: ErrorSchema } },
        description: 'IPごとのリクエスト制限（10件/60秒）を超過'
      },
      200: {
        content: {
          'application/json': {
            schema: RouteEndpointResponseSchema
          }
        },
        description: '経路情報生成成功'
      }
    },
    tags: ['routes']
  }),
  async (c) => {
    const legs = normalizeLegs(c.req.valid('json').legs)
    if (legs.some((leg) => Object.values(leg).some((name) => !name))) {
      throw new HTTPException(400, { message: '駅名・店舗名を入力してください。' })
    }
    const quota = await c.env.DIRECTIONS_RATE_LIMITER.limit({ key: `directions:${c.get('CLIENT_IP')}` })
    if (!quota.success) {
      throw new HTTPException(429, {
        message: '経路検索の回数制限を超えました。しばらく待ってから再度お試しください。'
      })
    }

    if (legs.length === 0) {
      return c.json({ legs: [] }, 200)
    }

    // ローカル環境ではモックを返す（Workers AIはローカルで動作しない）
    if (!c.env.AI) {
      return c.json({ legs: mockLegs }, 200)
    }

    let cachedRoute: Awaited<ReturnType<typeof routeCache>>
    try {
      cachedRoute = await routeCache(c.req.url, legs)
      const hit = await cachedRoute?.cache.match(cachedRoute.key)
      if (hit) {
        const result = RouteResponseSchema.safeParse(await hit.json())
        if (result.success && !result.data.degraded) return c.json(result.data, 200)
      }
    } catch {
      // Cache outages must not prevent route generation.
    }

    try {
      const ai = c.env.AI

      const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'user',
            content: buildPrompt(legs)
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            properties: {
              legs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    fromStation: { type: 'string' },
                    toStation: { type: 'string' },
                    routes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          operator: { type: 'string' },
                          line: { type: 'string' },
                          from: { type: 'string' },
                          to: { type: 'string' },
                          duration: { type: 'number' }
                        },
                        required: ['operator', 'line', 'from', 'to', 'duration']
                      }
                    },
                    duration: { type: 'number' },
                    transfers: { type: 'number' }
                  },
                  required: ['from', 'to', 'fromStation', 'toStation', 'routes', 'duration', 'transfers']
                }
              }
            },
            required: ['legs']
          }
        }
      })

      const result = RouteResponseSchema.safeParse(response.response)

      if (!result.success) {
        console.error('[Routes API] Validation failed:', result.error.issues)
        console.error('[Routes API] Invalid LLM response structure:', response.response)
        // フォールバック: 元のリクエストに推測値を追加
        const fallbackLegs = legs.map((leg) => ({
          ...leg,
          routes: [],
          duration: 0,
          transfers: 0
        }))
        return c.json({ legs: fallbackLegs, degraded: true }, 200)
      }

      console.log('[Routes API] Validation success, returning data')
      // Cache only validated, non-degraded results for the requested endpoints.
      // Count/identity mismatches remain uncached for the later AI correctness task.
      const matchesRequest =
        result.data.legs.length === legs.length &&
        result.data.legs.every((leg, i) =>
          (['from', 'to', 'fromStation', 'toStation'] as const).every(
            (field) => leg[field].trim().normalize('NFC') === legs[i][field]
          )
        )
      if (cachedRoute && !result.data.degraded && matchesRequest) {
        const canonical = { ...result.data, legs: result.data.legs.map((leg, i) => ({ ...leg, ...legs[i] })) }
        try {
          await cachedRoute.cache.put(
            cachedRoute.key,
            new Response(JSON.stringify(canonical), {
              headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }
            })
          )
        } catch {
          // Returning a successful result takes precedence over caching it.
        }
        return c.json(canonical, 200)
      }
      return c.json(result.data, 200)
    } catch (error) {
      console.error('Workers AI error:', error)
      // エラー時もフォールバック
      const fallbackLegs = legs.map((leg) => ({
        ...leg,
        routes: [],
        duration: 0,
        transfers: 0
      }))
      return c.json({ legs: fallbackLegs, degraded: true }, 200)
    }
  }
)

export default app
