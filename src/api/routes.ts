import { Hono } from 'hono'
import { z } from 'zod'
import type { Bindings, Variables } from '@/types/bindings'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * 経路区間のスキーマ
 */
const LegSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromStation: z.string(),
  toStation: z.string()
})

/**
 * リクエストスキーマ
 */
const RouteRequestSchema = z.object({
  legs: z.array(LegSchema)
})

/**
 * LLMからの応答スキーマ
 */
const RouteResponseSchema = z.object({
  legs: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      fromStation: z.string(),
      toStation: z.string(),
      lines: z.array(z.string()),
      duration: z.number(),
      transfers: z.number()
    })
  )
})

/**
 * LLMに経路を推測させるプロンプトを生成
 */
const buildPrompt = (legs: z.infer<typeof LegSchema>[]) => {
  const legDescriptions = legs.map((leg, i) => `${i + 1}. ${leg.fromStation} → ${leg.toStation}`).join('\n')

  return `あなたは日本の鉄道路線に詳しい専門家です。
以下の駅間の移動について、利用する路線名と概算の所要時間を回答してください。
乗り換えがある場合は全ての路線名を含めてください。

${legDescriptions}

以下のJSON形式で回答してください。durationは所要時間（分単位の数値）、transfersは乗り換え回数です。
{
  "legs": [
    {
      "from": "店舗名",
      "to": "店舗名",
      "fromStation": "出発駅",
      "toStation": "到着駅",
      "lines": ["路線名1", "路線名2"],
      "duration": 30,
      "transfers": 0
    }
  ]
}`
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

    const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'user',
          content: buildPrompt(legs)
        }
      ]
    })

    // レスポンスからJSONを抽出
    const responseText = typeof response === 'string' ? response : ''

    // JSONをパース
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Failed to extract JSON from response:', responseText)
      return c.json({ error: 'Failed to parse LLM response' }, 500)
    }

    const parsed = JSON.parse(jsonMatch[0])
    const validatedResponse = RouteResponseSchema.safeParse(parsed)

    if (!validatedResponse.success) {
      console.error('Invalid LLM response structure:', parsed)
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
