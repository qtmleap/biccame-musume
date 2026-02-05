import { Hono } from 'hono'
import { type Leg, RouteRequestSchema, RouteResponseSchema } from '@/schemas/route.dto'
import type { Bindings, Variables } from '@/types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * LLMに経路を推測させるプロンプトを生成
 */
const buildPrompt = (legs: Leg[]) => {
  const legDescriptions = legs.map((leg, i) => `${i + 1}. ${leg.fromStation} → ${leg.toStation}`).join('\n')

  return [
    'あなたは日本の鉄道路線に詳しい専門家です。',
    '以下の駅間の移動について、利用する路線名と概算の所要時間（分単位）、乗り換え回数を回答してください。',
    '乗り換えがある場合は全ての路線名を含めてください。',
    '',
    '回答に含めるパラメータ:',
    '- from: 出発店舗名',
    '- to: 到着店舗名',
    '- fromStation: 出発駅名',
    '- toStation: 到着駅名',
    '- lines: 利用する路線名の配列',
    '- duration: 所要時間（分単位の数値）',
    '- transfers: 乗り換え回数',
    '',
    legDescriptions
  ].join('\n')
}

/**
 * POST /api/routes - 経路情報をLLMで生成
 */
app.post('/', async (c) => {
  const body = await c.req.json()
  const parseResult = RouteRequestSchema.safeParse(body)

  if (!parseResult.success) {
    return c.json({ error: 'Invalid request', details: parseResult.error.issues }, 400)
  }

  const { legs } = parseResult.data

  if (legs.length === 0) {
    return c.json({ legs: [] })
  }

  // ローカル環境ではモックを返す（Workers AIはローカルで動作しない）
  if (!c.env.AI) {
    const mockLegs = legs.map((leg) => ({
      ...leg,
      lines: ['モック路線'],
      duration: 30,
      transfers: 1
    }))
    return c.json({ legs: mockLegs })
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
                  lines: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  duration: { type: 'number' },
                  transfers: { type: 'number' }
                },
                required: ['from', 'to', 'fromStation', 'toStation', 'lines', 'duration', 'transfers']
              }
            }
          },
          required: ['legs']
        }
      }
    })

    // レスポンスの型はstring | ReadableStreamまたはobjectの可能性がある
    let parsedResponse: unknown
    if (typeof response === 'string') {
      parsedResponse = JSON.parse(response)
    } else if (typeof response === 'object' && response !== null) {
      parsedResponse = response
    } else {
      throw new Error('Unexpected response format')
    }

    const validatedResponse = RouteResponseSchema.safeParse(parsedResponse)

    if (!validatedResponse.success) {
      console.error('Invalid LLM response structure:', parsedResponse)
      // フォールバック: 元のリクエストに推測値を追加
      const fallbackLegs = legs.map((leg) => ({
        ...leg,
        lines: ['不明'],
        duration: 0,
        transfers: 0
      }))
      return c.json({ legs: fallbackLegs })
    }

    return c.json(validatedResponse.data)
  } catch (error) {
    console.error('Workers AI error:', error)
    // エラー時もフォールバック
    const fallbackLegs = legs.map((leg) => ({
      ...leg,
      lines: ['不明'],
      duration: 0,
      transfers: 0
    }))
    return c.json({ legs: fallbackLegs })
  }
})

export default app
