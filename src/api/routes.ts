import { Hono } from 'hono'
import { type Leg, RouteRequestSchema, RouteResponseSchema } from '@/schemas/route.dto'
import type { Bindings, Variables } from '@/types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

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
      return c.json({ legs: fallbackLegs })
    }

    console.log('[Routes API] Validation success, returning data')
    return c.json(result.data)
  } catch (error) {
    console.error('Workers AI error:', error)
    // エラー時もフォールバック
    const fallbackLegs = legs.map((leg) => ({
      ...leg,
      routes: [],
      duration: 0,
      transfers: 0
    }))
    return c.json({ legs: fallbackLegs })
  }
})

export default app
