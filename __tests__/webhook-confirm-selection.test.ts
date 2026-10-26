import { expect, test } from 'bun:test'
import { EVENT_DETECTION_FIELD_THRESHOLDS_KEY } from '@api/services/webhook-config'
import { runWebhookDetection } from '@api/services/webhook-detection-run'
import { type ClefAnswer, type ClefRequest, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { DETECTION_VERSION, resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
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
  /** 1 段目の最上位の確率（既定 0.6）。70% 以上は確認なしで確定するので、確認を聞かせるため既定は 70% 未満にする。 */
  probability?: number
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
            ...(plan.character === undefined ? {} : { character: plan.character }),
            probability: plan.probability === undefined ? 0.6 : plan.probability
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

test('1 段目の最上位が 70% 以上なら確認を聞かず、2 段目は送らない（呼び出しが 1 回に減る）。ちょうど 70% も聞かない', async () => {
  for (const probability of [0.99, 0.85, 0.7]) {
    const { cleanup, env, calls } = await harness(`confirm-selection-confident-${probability}`, {
      store: 'akiba',
      character: 'funato',
      probability
    })
    try {
      const sent: number[] = []
      const run = await runWebhookDetection(env, post, 'akiba', async (requests) => {
        sent.push(requests.length)
      })
      expect(calls, String(probability)).toHaveLength(1)
      expect(sent).toEqual([1])
      expect(run.requests).toHaveLength(1)
      expect(Object.keys(run.request.questions)).not.toContain('store_confirm')
      expect(Object.keys(run.request.questions)).not.toContain('character_confirm')
      expect(Object.keys(run.response.answers)).not.toContain('store_confirm')
    } finally {
      await cleanup()
    }
  }
})

test('70% 未満（69.9%）は確認を聞く。保存した店舗のしきい値が高ければ（0.9）、85% でも聞く', async () => {
  const below = await harness('confirm-selection-below', { store: 'akiba', character: 'funato', probability: 0.699 })
  try {
    await runWebhookDetection(below.env, post, 'akiba', async () => {})
    expect(below.calls).toHaveLength(2)
    expect(Object.keys(below.calls[1].request.questions)).toEqual(['store_confirm', 'character_confirm'])
  } finally {
    await below.cleanup()
  }
  const saved = await harness('confirm-selection-saved-threshold', {
    store: 'akiba',
    character: 'funato',
    probability: 0.85
  })
  try {
    await saved.env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
      JSON.stringify({ ...resolveFieldThresholds(0.9), store: 0.9 })
    )
    await runWebhookDetection(saved.env, post, 'akiba', async () => {})
    // 店舗は保存値 0.9 に届かないので聞く。娘は既定 0.7 以上なので聞かない。
    expect(saved.calls).toHaveLength(2)
    expect(Object.keys(saved.calls[1].request.questions)).toEqual(['store_confirm'])
  } finally {
    await saved.cleanup()
  }
})

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

test('最上位の娘が店舗の娘（最上位の店舗と同じ ID）でも、店舗と娘の確認を 1 リクエストにまとめて 1 回送る（二回チェック）', async () => {
  const { cleanup, env, calls } = await harness('confirm-selection-store-character', {
    store: 'akiba',
    character: 'akiba'
  })
  try {
    const sent: number[] = []
    const run = await runWebhookDetection(env, post, 'akiba', async (requests) => {
      sent.push(requests.length)
    })
    // AI は 2 回（1 段目 + 店舗と娘をまとめた 2 段目）。店舗の確認と娘の確認の質問があり、state の末尾に 2 つの対象の行が付く。
    expect(calls).toHaveLength(2)
    expect(sent).toEqual([1, 2])
    expect(Object.keys(calls[1].request.questions)).toEqual(['store_confirm', 'character_confirm'])
    expect(calls[1].request.state.split('\n').slice(-2)).toEqual([
      '確認対象の開催店舗: AKIBA店',
      '確認対象のビッカメ娘: アキバたん'
    ])
    expect(Object.keys(run.request.questions)).toEqual(expect.arrayContaining(['store_confirm', 'character_confirm']))
    expect(Object.keys(run.response.answers)).toEqual(expect.arrayContaining(['store_confirm', 'character_confirm']))
    expect(Object.keys(run.response.answers).sort()).toEqual(Object.keys(run.request.questions).sort())
  } finally {
    await cleanup()
  }
})

test.each([
  ['none', 'akiba'],
  ['multiple', 'akiba']
])('店舗が %s で娘が具体的（%s）なら、店舗の娘とは言えないので娘の確認だけを送る', async (store, character) => {
  const { cleanup, env, calls } = await harness(`confirm-selection-character-${store}`, { store, character })
  try {
    await runWebhookDetection(env, post, null, async () => {})
    expect(calls).toHaveLength(2)
    expect(Object.keys(calls[1].request.questions)).toEqual(['character_confirm'])
    expect(calls[1].request.state.split('\n').at(-1)).toBe('確認対象のビッカメ娘: アキバたん')
    expect(calls[1].request.state).not.toContain('確認対象の開催店舗')
  } finally {
    await cleanup()
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

test('確認の確率は 1 段目の最上位が低くても対象を変えない（最上位の店舗と、店舗と別の娘をそのまま確認する）', async () => {
  const { cleanup, env, calls } = await harness('confirm-selection-low-yes', {
    store: 'akiba',
    character: 'funato',
    yes: 0.1
  })
  try {
    const run = await runWebhookDetection(env, post, 'akiba', async () => {})
    expect(calls).toHaveLength(2)
    // 確認の確率が低くても例外にせず、回答をそのまま返す（保留にするのは evaluateDetection）。
    expect(run.response.answers.store_confirm).toEqual({ type: 'noul', noul: 0.1 })
    expect(run.response.answers.character_confirm).toEqual({ type: 'noul', noul: 0.1 })
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

test('版は v17 で、2 段目の質問は版定義に載る', () => {
  expect(DETECTION_VERSION).toBe('v5-webhook-v17-store-character')
})
