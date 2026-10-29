import { expect, test } from 'bun:test'
import { claimWebhookJob, insertWebhookJob, webhookTarget } from '@api/services/webhook-jobs'
import { getWebhookPrompt, saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import { createConfirmRequest, STORE_CONFIRM_QUESTION } from '@biccame/shared/event-detect/association-confirm'
import { STORE_CONFIRM_KEY } from '@biccame/shared/event-detect/associations'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { webhookPromptDefinition } from '@biccame/shared/event-detect/prompt-definitions'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// v18 は 2 段目の店舗の確認の質問だけを直した版（現行は v19。v19 は 2 段目の質問を変えず、1 段目の質問文も変えていない）。版を上げないと保存済みの定義と食い違い、送信入力の保存が止まる（判定が止まる）。
const V17 = 'v5-webhook-v17-store-character'
const V18 = 'v5-webhook-v18-store-confirm-default'
const V19 = 'v5-webhook-v19-gift-card-category'
const post = makePost('2112378276735750901', '本日からアキバたんの限定名刺をどなたでも配布します。')

const setup = async (env: Awaited<ReturnType<typeof fixture>>['env']) => {
  await insertWebhookJob(env, post)
  const token = await claimWebhookJob(env, post.id)
  if (token === null) throw new Error('Missing lease')
  const first = createDetectionRequests(post)
  const confirm = createConfirmRequest(first[0], { store: 'akiba', character: 'funato' })
  return { env, token, first, confirm }
}
const withJob = async (name: string, run: (input: Awaited<ReturnType<typeof setup>>) => Promise<void>) => {
  const base = await fixture(name)
  try {
    await migrate(base.env.DB)
    await run(await setup(base.env))
  } finally {
    await base.cleanup()
  }
}
const withStoreConfirm = (request: ClefRequest, instructions: string): ClefRequest => ({
  ...request,
  questions: { ...request.questions, [STORE_CONFIRM_KEY]: { type: 'noul', instructions } }
})
const definitionOf = (version: string) => {
  const definition = webhookPromptDefinition(version)
  if (definition === undefined) throw new Error(`Missing prompt definition: ${version}`)
  return definition
}
const storedStoreConfirm = (version: string) => {
  const question = definitionOf(version).questions.find((entry) => entry.key === STORE_CONFIRM_KEY)
  if (question === undefined) throw new Error(`Missing store_confirm in ${version}`)
  return question.instructions
}

test('現行の版は v19 で、1 段目 + 2 段目の送信入力が保存でき、版定義と一緒に返る（店舗の確認の質問は v18 と同じ）', async () => {
  expect(DETECTION_VERSION).toBe(V19)
  await withJob('store-confirm-v19-save', async ({ env, token, first, confirm }) => {
    expect(confirm.questions[STORE_CONFIRM_KEY]).toEqual(STORE_CONFIRM_QUESTION)
    const requests = [...first, confirm]
    await saveWebhookPromptAttempt(env, webhookTarget(post.id), token, DETECTION_VERSION, requests)
    const saved = await getWebhookPrompt(env, post.id)
    expect(saved.source).toBe('recorded')
    expect(saved.questionVersion).toBe(V19)
    expect(saved.requests).toEqual(requests)
    expect(saved.definition).toEqual(definitionOf(V19))
    expect(saved.definition?.questions.find((entry) => entry.key === STORE_CONFIRM_KEY)?.instructions).toBe(
      STORE_CONFIRM_QUESTION.instructions
    )
  })
}, 60000)

test('v17 の旧い店舗の確認の質問は v18 として保存できず、v18 の質問は v17 として保存できない（版と質問文は対で固定）', async () => {
  await withJob('store-confirm-v18-mismatch', async ({ env, token, first, confirm }) => {
    // v19 の 1 段目は、gift_card を出さない投稿なら v17・v18 の 1 段目と完全に同一なので、そのまま v17・v18 として保存できる（店舗の確認の質問だけを比べる）。
    const old = storedStoreConfirm(V17)
    expect(old).not.toBe(STORE_CONFIRM_QUESTION.instructions)
    const target = webhookTarget(post.id)
    await expect(
      saveWebhookPromptAttempt(env, target, token, V18, [...first, withStoreConfirm(confirm, old)])
    ).rejects.toThrow('Webhook request does not match its prompt version')
    await expect(saveWebhookPromptAttempt(env, target, token, V17, [...first, confirm])).rejects.toThrow(
      'Webhook request does not match its prompt version'
    )
    // 拒否された試行は何も保存しない。
    expect(await getWebhookPrompt(env, post.id)).toEqual({
      questionVersion: null,
      requests: [],
      source: 'unavailable',
      definition: null
    })
    // v18 の 1 段目 + v18 の店舗の確認は、v18 として今も保存できる。
    await saveWebhookPromptAttempt(env, target, token, V18, [...first, confirm])
    expect((await getWebhookPrompt(env, post.id)).questionVersion).toBe(V18)
    // v17 の旧文言は、v17 の版としてなら今も保存できる（保存済みの定義は変わっていない）。
    const legacy = [...first, withStoreConfirm(confirm, old)]
    await saveWebhookPromptAttempt(env, target, token, V17, legacy)
    expect((await getWebhookPrompt(env, post.id)).requests).toEqual(legacy)
  })
}, 60000)
