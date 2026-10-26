import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { EVENT_DETECTION_FIELD_THRESHOLDS_KEY, EVENT_DETECTION_THRESHOLDS_KEY } from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { type ClefAnswer, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

type Overrides = {
  isEvent?: number
  store?: [string, number]
  character?: [string, number]
  /** 2 段目（確認）の「はい」の確率。省略時は 0.99。 */
  confirm?: { store_confirm?: number; character_confirm?: number }
}

/** 全項目を高確度で答える回答のうち、is_event・store・character だけを確率つきで差し替える。 */
const harness = async (name: string) => {
  const base = await fixture(name)
  const overrides: { value: Overrides } = { value: {} }
  // 2 段目（確認）として送られた質問のキー（呼び出しごと）。
  const confirmAsked: string[][] = []
  const baseRun = base.env.AI.run
  const env = Object.assign(base.env, {
    AI: {
      run: async (model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid request')
        if (parsed.data.questions.is_event === undefined) {
          // 件数の質問は元のフェイクに任せる。確認の質問は記録して、overrides の「はい」で答える。
          if (parsed.data.questions.distribution_item_count !== undefined) return baseRun(model, raw)
          const keys = Object.keys(parsed.data.questions)
          confirmAsked.push(keys)
          const yes: Record<string, number> = {
            store_confirm: 0.99,
            character_confirm: 0.99,
            ...overrides.value.confirm
          }
          return {
            answers: Object.fromEntries(
              keys.map((key): [string, ClefAnswer] => [key, { type: 'noul', noul: yes[key] }])
            )
          }
        }
        const response = answer(parsed.data)
        const choice = (key: 'store' | 'character', pick: [string, number]): ClefAnswer => {
          const question = parsed.data.questions[key]
          if (question.type !== 'choice') throw new Error('Expected a choice question')
          const keys = Object.keys(question.criteria)
          return {
            type: 'choice',
            choice: pick[0],
            probabilities: Object.fromEntries(keys.map((value) => [value, value === pick[0] ? pick[1] : 0.001]))
          }
        }
        const { isEvent, store, character } = overrides.value
        return {
          answers: {
            ...response.answers,
            ...(isEvent === undefined ? {} : { is_event: { type: 'noul' as const, noul: isEvent } }),
            ...(store === undefined ? {} : { store: choice('store', store) }),
            ...(character === undefined ? {} : { character: choice('character', character) })
          }
        }
      }
    }
  })
  await migrate(env.DB)
  return { ...base, env, overrides, confirmAsked }
}

const judge = async (env: Awaited<ReturnType<typeof harness>>['env'], id: string, text: string, store: string) => {
  const post = makePost(id, text)
  await insertWebhookJob(env, post)
  await processWebhookJob(env, post.id, {
    extractor: async () => ({
      events: [{ item: `限定名刺${id}`, stores: [store], characterIds: [], evidence: [text] }]
    })
  })
  return (await getWebhookJob(env, post.id)).candidates[0]
}

test('is_event は参考値で、低くても店舗と娘が取れれば登録される（confidence は P(is_event) のまま）', async () => {
  const { cleanup, env, overrides } = await harness('association-thresholds-is-event')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    overrides.value = { isEvent: 0.2 }
    const low = await judge(env, '2112378276735750731', '本日からアキバたんの限定名刺をどなたでも配布します。', 'akiba')
    expect(low.status).toBe('registered')
    expect(low.reasons).not.toContain('event_confidence_below_threshold')
    expect(low.confidence).toBe(0.2)
    // 登録の閾値（eventThreshold）を上限にしても、is_event は登録・保留の判定に使われない。
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_THRESHOLDS_KEY,
      JSON.stringify({ eventThreshold: 1, ignoreThreshold: 0.5, choiceThreshold: 0.9 })
    )
    const strict = await judge(
      env,
      '2112378276735750732',
      '本日からあべのたんの限定名刺をどなたでも配布します。',
      'abeno'
    )
    expect(strict.status).toBe('registered')
    expect(strict.reasons).not.toContain('event_confidence_below_threshold')
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

const saveFieldThresholds = (
  env: Awaited<ReturnType<typeof harness>>['env'],
  overrides: Parameters<typeof resolveFieldThresholds>[1]
) =>
  env.BICCAME_MUSUME_EVENTS.put(
    EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
    JSON.stringify(resolveFieldThresholds(0.9, overrides))
  )

test('store は既定 70% で判定する: 85% は確認なしで登録、60% は確認の「はい」で決まる', async () => {
  const { cleanup, env, overrides, confirmAsked } = await harness('association-thresholds-store')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    overrides.value = { store: ['nanba', 0.85] }
    const confident = await judge(
      env,
      '2112378276735750733',
      '本日からなんばたんの限定名刺をどなたでも配布します。',
      'nanba'
    )
    expect(confident.status).toBe('registered')
    expect(confident.candidate?.stores).toEqual(['nanba'])
    expect(confirmAsked).toEqual([])
    // 60% は確認を聞く。「はい」が高ければ登録、低ければ store_unconfirmed + store_confirm_low で保留（候補なし）。
    overrides.value = { store: ['yao', 0.6], confirm: { store_confirm: 0.97 } }
    const asked = await judge(env, '2112378276735750734', '本日から八尾たんの限定名刺をどなたでも配布します。', 'yao')
    expect(asked.status).toBe('registered')
    expect(asked.candidate?.stores).toEqual(['yao'])
    expect(confirmAsked.at(-1)).toContain('store_confirm')
    overrides.value = { store: ['yao', 0.6], confirm: { store_confirm: 0.4 } }
    const rejected = await judge(
      env,
      '2112378276735750737',
      '本日から八尾たんの限定名刺をどなたでも配布します。',
      'yao'
    )
    expect(rejected.status).toBe('held')
    expect(rejected.reasons).toEqual(expect.arrayContaining(['store_unconfirmed', 'store_confirm_low']))
    expect(rejected.candidate).toBeNull()
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('KV に保存した store の値が効く: 0.9 なら 85% でも確認を聞く（確認が低ければ保留）、0.5 なら 60% は確認なしで登録', async () => {
  const { cleanup, env, overrides, confirmAsked } = await harness('association-thresholds-store-saved')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    // 本番に残っている store: 0.9。確認を聞く回数が増えるだけで、登録は止まらない（確認が高ければ登録される）。
    await saveFieldThresholds(env, { store: 0.9 })
    overrides.value = { store: ['nanba', 0.85], confirm: { store_confirm: 0.97 } }
    const viaConfirm = await judge(
      env,
      '2112378276735750740',
      '本日からなんばたんの限定名刺をどなたでも配布します。',
      'nanba'
    )
    expect(confirmAsked.at(-1)).toContain('store_confirm')
    expect(viaConfirm.status).toBe('registered')
    overrides.value = { store: ['nanba', 0.85], confirm: { store_confirm: 0.3 } }
    const rejected = await judge(
      env,
      '2112378276735750741',
      '本日からなんばたんの限定名刺をどなたでも配布します。',
      'nanba'
    )
    expect(rejected.status).toBe('held')
    expect(rejected.reasons).toContain('store_confirm_low')
    // 95% は保存値 0.9 以上なので聞かない。
    const before = confirmAsked.length
    overrides.value = { store: ['nanba', 0.95] }
    const confident = await judge(
      env,
      '2112378276735750742',
      '本日からなんばたんの限定名刺をどなたでも配布します。',
      'nanba'
    )
    expect(confident.status).toBe('registered')
    expect(confirmAsked).toHaveLength(before)
    // 下げた保存値 0.5 では 60% は確認なしで登録される。
    await saveFieldThresholds(env, { store: 0.5 })
    overrides.value = { store: ['yao', 0.6] }
    const lowered = await judge(env, '2112378276735750743', '本日から八尾たんの限定名刺をどなたでも配布します。', 'yao')
    expect(lowered.status).toBe('registered')
    expect(confirmAsked).toHaveLength(before)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('確認のしきい値を 0.5 に保存すると、はい 60% で採用される（既定の 0.7 では保留）', async () => {
  const { cleanup, env, overrides } = await harness('association-thresholds-confirm')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    overrides.value = { store: ['yao', 0.6], confirm: { store_confirm: 0.6 } }
    const defaults = await judge(
      env,
      '2112378276735750744',
      '本日から八尾たんの限定名刺をどなたでも配布します。',
      'yao'
    )
    expect(defaults.status).toBe('held')
    expect(defaults.reasons).toContain('store_confirm_low')
    await saveFieldThresholds(env, { store_confirm: 0.5 })
    const saved = await judge(env, '2112378276735750745', '本日から八尾たんの限定名刺をどなたでも配布します。', 'yao')
    expect(saved.status).toBe('registered')
    expect(saved.candidate?.stores).toEqual(['yao'])
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('character は既定 70% で判定する: 60% は確認の「はい」が高ければ明示、低ければ店舗の娘。共通の choiceThreshold には依らない', async () => {
  const { cleanup, env, overrides, confirmAsked } = await harness('association-thresholds-character')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    // 60% で確認が低い: 別の娘（abeno）は明示されたものとして扱わず、採用した店舗（akiba）の娘で登録する。
    overrides.value = { character: ['abeno', 0.6], confirm: { character_confirm: 0.4 } }
    const registered = await judge(
      env,
      '2112378276735750735',
      '本日からアキバたんの限定名刺をどなたでも配布します。',
      'akiba'
    )
    expect(confirmAsked.at(-1)).toContain('character_confirm')
    expect(registered.status).toBe('registered')
    expect(registered.reasons).not.toContain('character_unconfirmed')
    expect(registered.candidate?.stores).toEqual(['akiba'])
    expect(registered.candidate?.characterIds).toEqual(['akiba'])
    // 共通の選択肢しきい値を 0.15 に下げても、娘の既定 70% は動かない（同じ 60% で確認を聞く）。
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_THRESHOLDS_KEY,
      JSON.stringify({ eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.15 })
    )
    const before = confirmAsked.length
    overrides.value = { character: ['akiba', 0.6], confirm: { character_confirm: 0.4 } }
    const notLowered = await judge(
      env,
      '2112378276735750736',
      '本日からあべのたんの限定名刺をどなたでも配布します。',
      'abeno'
    )
    expect(confirmAsked).toHaveLength(before + 1)
    expect(notLowered.candidate?.characterIds).toEqual(['abeno'])
    // 確認の「はい」が高ければ、明示された娘（akiba）で登録される。
    overrides.value = { character: ['akiba', 0.6], confirm: { character_confirm: 0.97 } }
    const explicit = await judge(
      env,
      '2112378276735750738',
      '本日からあべのたんの限定名刺をどなたでも配布します。',
      'abeno'
    )
    expect(explicit.candidate?.characterIds).toEqual(['akiba'])
    // 85% は確認を聞かず、明示として採用される。
    const asked = confirmAsked.length
    overrides.value = { character: ['akiba', 0.85] }
    const confident = await judge(
      env,
      '2112378276735750739',
      '本日からあべのたんの限定名刺をどなたでも配布します。',
      'abeno'
    )
    expect(confident.candidate?.characterIds).toEqual(['akiba'])
    expect(confirmAsked.slice(asked).flat()).not.toContain('character_confirm')
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)
