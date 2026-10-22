import { expect, test } from 'bun:test'
import { runWebhookDetection } from '@api/services/webhook-detection-run'
import { type ClefAnswer, type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// 2 段目（v16 の確認）を送る runWebhookDetection の単体。実際の AI は呼ばず、フェイクの AI が 1 段目の最上位と 2 段目の「はい」の確率を決める。
type Plan = {
  store?: string
  character?: string
  /** 確認の質問への「はい」の確率（既定 0.99）。 */
  yes?: number
  /** 2 段目の応答の壊し方。 */
  confirm?: 'ok' | 'throw' | 'invalid' | 'incomplete' | 'wrong_type'
  /** 1 段目の応答を失敗させる。 */
  first?: 'ok' | 'throw'
}
const isConfirm = (request: ClefRequest) => request.questions.is_event === undefined

const harness = async (name: string, plan: Plan) => {
  const base = await fixture(name)
  const calls: { model: string; request: ClefRequest }[] = []
  const env = Object.assign(base.env, {
    AI: {
      run: async (model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid request')
        calls.push({ model, request: parsed.data })
        if (!isConfirm(parsed.data)) {
          if (plan.first === 'throw') throw new Error('Synthetic first stage failure')
          return answer(parsed.data, {
            ...(plan.store === undefined ? {} : { store: plan.store }),
            ...(plan.character === undefined ? {} : { character: plan.character })
          })
        }
        const mode = plan.confirm === undefined ? 'ok' : plan.confirm
        if (mode === 'throw') throw new Error('Synthetic confirm failure')
        if (mode === 'invalid') return { unexpected: true }
        const yes: ClefAnswer = { type: 'noul', noul: plan.yes === undefined ? 0.99 : plan.yes }
        const keys = Object.keys(parsed.data.questions)
        if (mode === 'incomplete') return { answers: Object.fromEntries(keys.slice(1).map((key) => [key, yes])) }
        if (mode === 'wrong_type')
          return {
            answers: Object.fromEntries(
              keys.map((key) => [key, { type: 'choice', choice: 'a', probabilities: { a: 1 } }])
            )
          }
        return { answers: Object.fromEntries(keys.map((key) => [key, yes])) }
      }
    }
  })
  await migrate(env.DB)
  return { ...base, env, calls }
}

const post = makePost('2112378276735750801', '本日からアキバたんの限定名刺をどなたでも配布します。')

test('店舗も娘も具体的なら、1 段目の後に確認を 1 リクエストにまとめて 1 回だけ送り、まとめた request/response に含める', async () => {
  const { cleanup, env, calls } = await harness('confirm-selection-both', { store: 'akiba', character: 'funato' })
  try {
    const sent: number[] = []
    const run = await runWebhookDetection(env, post, 'akiba', async (requests) => {
      sent.push(requests.length)
    })
    // AI は 2 回（1 段目 + 2 段目）。2 段目は 1 段目が出そろってから送る。
    expect(calls).toHaveLength(2)
    expect(calls.map((call) => call.model)).toEqual(['@cf/cloudflare/clef', '@cf/cloudflare/clef'])
    expect(isConfirm(calls[0].request)).toBe(false)
    expect(isConfirm(calls[1].request)).toBe(true)
    expect(Object.keys(calls[1].request.questions)).toEqual(['store_confirm', 'character_confirm'])
    // 2 段目の state は 1 段目の state の末尾に、最上位に選ばれた名前の行を足したもの。
    expect(calls[1].request.state.startsWith(`${calls[0].request.state}\n`)).toBe(true)
    expect(calls[1].request.state.split('\n').slice(-2)).toEqual([
      '確認対象の開催店舗: AKIBA店',
      '確認対象のビッカメ娘: ふなとーたん'
    ])
    // 各送信の前に送信入力を渡す（1 段目の前は 1 件、2 段目の前は 2 件）。
    expect(sent).toEqual([1, 2])
    expect(run.requests).toEqual(calls.map((call) => call.request))
    // まとめた request / response に確認の質問と回答が含まれる（保存・再判定・回答表がそのまま扱える）。
    expect(Object.keys(run.request.questions)).toEqual(
      expect.arrayContaining(['store', 'character', 'store_confirm', 'character_confirm'])
    )
    expect(run.request.state).toBe(calls[0].request.state)
    expect(run.response.answers.store_confirm).toEqual({ type: 'noul', noul: 0.99 })
    expect(run.response.answers.character_confirm).toEqual({ type: 'noul', noul: 0.99 })
    expect(Object.keys(run.response.answers).sort()).toEqual(Object.keys(run.request.questions).sort())
  } finally {
    await cleanup()
  }
}, 60000)

test('店舗だけ・娘だけが具体的なら、その確認の質問だけを送る', async () => {
  const storeOnly = await harness('confirm-selection-store-only', { store: 'akiba', character: 'multiple' })
  try {
    const run = await runWebhookDetection(storeOnly.env, post, 'akiba', async () => {})
    expect(storeOnly.calls).toHaveLength(2)
    expect(Object.keys(storeOnly.calls[1].request.questions)).toEqual(['store_confirm'])
    expect(storeOnly.calls[1].request.state.split('\n').at(-1)).toBe('確認対象の開催店舗: AKIBA店')
    expect(Object.keys(run.response.answers)).not.toContain('character_confirm')
  } finally {
    await storeOnly.cleanup()
  }
  const characterOnly = await harness('confirm-selection-character-only', { store: 'none', character: 'secret' })
  try {
    await runWebhookDetection(characterOnly.env, post, null, async () => {})
    // 店舗は none、娘は secret なので、どちらも確認の対象にならない。
    expect(characterOnly.calls).toHaveLength(1)
  } finally {
    await characterOnly.cleanup()
  }
  const onlyCharacter = await harness('confirm-selection-character-only-concrete', {
    store: 'multiple',
    character: 'funato'
  })
  try {
    await runWebhookDetection(onlyCharacter.env, post, null, async () => {})
    expect(onlyCharacter.calls).toHaveLength(2)
    expect(Object.keys(onlyCharacter.calls[1].request.questions)).toEqual(['character_confirm'])
    expect(onlyCharacter.calls[1].request.state.split('\n').at(-1)).toBe('確認対象のビッカメ娘: ふなとーたん')
  } finally {
    await onlyCharacter.cleanup()
  }
})

test.each([
  ['none', 'other'],
  ['multiple', 'secret'],
  ['none', 'none'],
  ['multiple', 'multiple']
])('店舗が %s・娘が %s のようにどちらも具体的でなければ、2 段目は送らず質問も作らない', async (store, character) => {
  const { cleanup, env, calls } = await harness(`confirm-selection-none-${store}-${character}`, { store, character })
  try {
    const sent: number[] = []
    const run = await runWebhookDetection(env, post, null, async (requests) => {
      sent.push(requests.length)
    })
    expect(calls).toHaveLength(1)
    expect(sent).toEqual([1])
    expect(run.requests).toHaveLength(1)
    expect(Object.keys(run.request.questions)).not.toContain('store_confirm')
    expect(Object.keys(run.request.questions)).not.toContain('character_confirm')
    expect(Object.keys(run.response.answers)).not.toContain('store_confirm')
  } finally {
    await cleanup()
  }
})

test('確認の確率は 1 段目の最上位が低くても対象を変えない（最上位の店舗・娘をそのまま確認する）', async () => {
  const { cleanup, env, calls } = await harness('confirm-selection-low-yes', {
    store: 'akiba',
    character: 'akiba',
    yes: 0.1
  })
  try {
    const run = await runWebhookDetection(env, post, 'akiba', async () => {})
    expect(calls).toHaveLength(2)
    // 確認の確率が低くても例外にせず、回答をそのまま返す（保留にするのは evaluateDetection）。
    expect(run.response.answers.store_confirm).toEqual({ type: 'noul', noul: 0.1 })
  } finally {
    await cleanup()
  }
})

test.each([
  ['throw', 'Synthetic confirm failure'],
  ['invalid', 'Invalid AI response'],
  ['incomplete', 'Incomplete detection response'],
  ['wrong_type', 'Incomplete detection response']
] as const)('2 段目の応答が %s のときは例外にし、1 段目だけの回答を返さない', async (confirm, message) => {
  const { cleanup, env, calls } = await harness(`confirm-selection-failure-${confirm}`, {
    store: 'akiba',
    character: 'funato',
    confirm
  })
  try {
    const sent: number[] = []
    await expect(
      runWebhookDetection(env, post, 'akiba', async (requests) => {
        sent.push(requests.length)
      })
    ).rejects.toThrow(message)
    expect(calls).toHaveLength(2)
    // 2 段目の送信前の入力は渡している（送信試行の記録は呼び出し側が決める）。
    expect(sent).toEqual([1, 2])
  } finally {
    await cleanup()
  }
})

test('1 段目が失敗したときは 2 段目を送らない', async () => {
  const { cleanup, env, calls } = await harness('confirm-selection-first-failure', { first: 'throw' })
  try {
    await expect(runWebhookDetection(env, post, 'akiba', async () => {})).rejects.toThrow(
      'Synthetic first stage failure'
    )
    expect(calls).toHaveLength(1)
  } finally {
    await cleanup()
  }
})

test('版は v16 で、2 段目の質問は版定義に載る', () => {
  expect(DETECTION_VERSION).toBe('v5-webhook-v16-confirm-selection')
})
