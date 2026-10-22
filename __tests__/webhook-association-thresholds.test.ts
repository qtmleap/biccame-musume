import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { EVENT_DETECTION_FIELD_THRESHOLDS_KEY, EVENT_DETECTION_THRESHOLDS_KEY } from '@api/services/webhook-config'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import { type ClefAnswer, ClefRequestSchema } from '@biccame/shared/event-detect/clef'
import { resolveFieldThresholds } from '@biccame/shared/event-detect/detection'
import { answer, fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

type Overrides = { isEvent?: number; store?: [string, number]; character?: [string, number] }

/** 全項目を高確度で答える回答のうち、is_event・store・character だけを確率つきで差し替える。 */
const harness = async (name: string) => {
  const base = await fixture(name)
  const overrides: { value: Overrides } = { value: {} }
  const baseRun = base.env.AI.run
  const env = Object.assign(base.env, {
    AI: {
      run: async (model: string, raw: unknown) => {
        const parsed = ClefRequestSchema.safeParse(raw)
        if (!parsed.success) throw new Error('Invalid request')
        if (parsed.data.questions.is_event === undefined) return baseRun(model, raw)
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
  return { ...base, env, overrides }
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

test('store の確率が項目別のしきい値に届かなければ store_unconfirmed で保留し、下げれば登録される', async () => {
  const { cleanup, env, overrides } = await harness('association-thresholds-store')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    // 未保存の store のしきい値は 0.3（最上位採用の下限）。0.2 の選択は下限に届かず、店舗が決まらないので保留（候補なし）。
    overrides.value = { store: ['nanba', 0.2] }
    const held = await judge(
      env,
      '2112378276735750733',
      '本日からなんばたんの限定名刺をどなたでも配布します。',
      'nanba'
    )
    expect(held.status).toBe('held')
    expect(held.reasons).toContain('store_unconfirmed')
    expect(held.reasons).not.toContain('character_unconfirmed')
    expect(held.candidate).toBeNull()
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_FIELD_THRESHOLDS_KEY,
      JSON.stringify({ ...resolveFieldThresholds(0.9), store: 0.15 })
    )
    overrides.value = { store: ['yao', 0.2] }
    const lowered = await judge(env, '2112378276735750734', '本日から八尾たんの限定名刺をどなたでも配布します。', 'yao')
    expect(lowered.status).toBe('registered')
    expect(lowered.candidate?.stores).toEqual(['yao'])
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('character は min(共通のしきい値 choiceThreshold, 0.3) で判定し、届かなければ明示されていないとして店舗の娘で登録する', async () => {
  const { cleanup, env, overrides } = await harness('association-thresholds-character')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    // 0.2 は下限（0.3）に届かないので、別の娘（abeno）が最上位でも明示されたものとして扱わず、採用した店舗（akiba）の娘で登録する。
    overrides.value = { character: ['abeno', 0.2] }
    const registered = await judge(
      env,
      '2112378276735750735',
      '本日からアキバたんの限定名刺をどなたでも配布します。',
      'akiba'
    )
    expect(registered.status).toBe('registered')
    expect(registered.reasons).not.toContain('character_unconfirmed')
    expect(registered.candidate?.stores).toEqual(['akiba'])
    expect(registered.candidate?.characterIds).toEqual(['akiba'])
    // 共通の選択肢しきい値を 0.15 に下げると、同じ 0.2 の回答でも娘が明示されたものとして確定し、その娘で登録される（下限は min(共通値, 0.3)）。
    await env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_THRESHOLDS_KEY,
      JSON.stringify({ eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.15 })
    )
    overrides.value = { character: ['akiba', 0.2] }
    const lowered = await judge(
      env,
      '2112378276735750736',
      '本日からあべのたんの限定名刺をどなたでも配布します。',
      'abeno'
    )
    expect(lowered.status).toBe('registered')
    expect(lowered.candidate?.stores).toEqual(['abeno'])
    expect(lowered.candidate?.characterIds).toEqual(['akiba'])
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)
