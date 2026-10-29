import { expect, test } from 'bun:test'
import { claimWebhookJob, insertWebhookJob, webhookTarget } from '@api/services/webhook-jobs'
import { getWebhookPrompt, saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import { createConfirmRequest } from '@biccame/shared/event-detect/association-confirm'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { webhookPromptDefinition } from '@biccame/shared/event-detect/prompt-definitions'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// v19 は配布物（category）の選択肢に gift_card を足した版で、質問文は v18 から変えていない。選択肢だけが投稿ごとに変わる（版定義では dynamic）。
// 送った質問の instructions が版定義と完全一致しないと saveWebhookPromptAttempt が例外にして判定が止まるので、gift_card を出す投稿・出さない投稿の両方が保存できることを確かめる。
const V18 = 'v5-webhook-v18-store-confirm-default'
const V19 = 'v5-webhook-v19-gift-card-category'
// 質問文のギフトカードの1文を言い換えた request（実装しなかった案）。一字でも変えると版定義と食い違い、保存できない。
const REPHRASED_SENTENCE =
  'ギフトカードと明記された対象物は、選択肢にgift_cardがあればgift_card、無ければotherであり、販売品でもnoneにしません。'
const text = '本日からアキバたんのギフトカードをどなたでも配布します。'
const base = makePost('2112378276735750902', text)
const withItem = (item: string): DetectPost => ({
  ...base,
  extractionContext: { kind: 'item', item, evidence: [text], originalText: text }
})
const giftPost = withItem('アキバたんギフトカード')
const keyholderPost = withItem('アクリルキーホルダー')
const eventPost: DetectPost = {
  ...base,
  extractionContext: {
    kind: 'event',
    item: '投稿全体の関連性確認（配布物未抽出）',
    evidence: [text],
    originalText: text
  }
}

const setup = async (env: Awaited<ReturnType<typeof fixture>>['env']) => {
  await insertWebhookJob(env, base)
  const token = await claimWebhookJob(env, base.id)
  if (token === null) throw new Error('Missing lease')
  return { env, token, target: webhookTarget(base.id) }
}
const withJob = async (name: string, run: (input: Awaited<ReturnType<typeof setup>>) => Promise<void>) => {
  const harness = await fixture(name)
  try {
    await migrate(harness.env.DB)
    await run(await setup(harness.env))
  } finally {
    await harness.cleanup()
  }
}
const definitionOf = (version: string) => {
  const definition = webhookPromptDefinition(version)
  if (definition === undefined) throw new Error(`Missing prompt definition: ${version}`)
  return definition
}
const categoryOf = (request: ClefRequest) => {
  const question = request.questions.category
  if (question?.type !== 'choice') throw new Error('Missing category question')
  return question
}
/** category の質問文のギフトカードの1文を言い換えた request（criteria はそのまま）。 */
const withRephrasedSentence = (request: ClefRequest): ClefRequest => {
  const category = categoryOf(request)
  const instructions = category.instructions.replace(
    'ギフトカードと明記された対象物はotherであり、販売品でもnoneにしません。',
    REPHRASED_SENTENCE
  )
  if (instructions === category.instructions) throw new Error('Missing gift card sentence')
  return { ...request, questions: { ...request.questions, category: { ...category, instructions } } }
}

const categoryDefinitionOf = (version: string) => {
  const question = definitionOf(version).questions.find((entry) => entry.key === 'category')
  if (question === undefined) throw new Error(`Missing category question in ${version}`)
  return question
}

test('現行の版は v19 で、category の選択肢は版定義では dynamic（投稿ごとに変わる）', () => {
  expect(DETECTION_VERSION).toBe(V19)
  expect(Object.keys(categoryDefinitionOf(V19).criteria)).toEqual(['dynamic'])
  // v18 までは固定の選択肢のまま（保存済みの定義は変えない）。
  expect(Object.keys(categoryDefinitionOf(V18).criteria)).toEqual([
    'limited_card',
    'regular_card',
    'ackey',
    'acsta',
    'other',
    'none'
  ])
})

test.each([
  ['gift_card を出す投稿（物品名にギフトカード）', giftPost, true],
  ['gift_card を出さない投稿（物品名が別の物）', keyholderPost, false],
  ['gift_card を出さない投稿（物品の抽出ではない文脈）', eventPost, false],
  ['gift_card を出さない投稿（抽出文脈なし）', base, false]
])(
  'v19: %s の送信入力は保存でき、版定義と一緒に返る',
  async (_label, post, offered) => {
    await withJob('gift-card-v19-save', async ({ env, token, target }) => {
      const first = createDetectionRequests(post)
      expect(Object.hasOwn(categoryOf(first[0]).criteria, 'gift_card')).toBe(offered)
      const confirm = createConfirmRequest(first[0], { store: 'akiba', character: 'funato' })
      const requests = [...first, confirm]
      await saveWebhookPromptAttempt(env, target, token, DETECTION_VERSION, requests)
      const saved = await getWebhookPrompt(env, base.id)
      expect(saved.source).toBe('recorded')
      expect(saved.questionVersion).toBe(V19)
      expect(saved.requests).toEqual(requests)
      expect(saved.definition).toEqual(definitionOf(V19))
    })
  },
  60000
)

test('v19 の category の質問文は、gift_card を出す投稿でも出さない投稿でも版定義（v18 と同一）と一字も違わない', () => {
  const defined = categoryDefinitionOf(V19)
  expect(defined.instructions).toBe(categoryDefinitionOf(V18).instructions)
  for (const post of [giftPost, keyholderPost, eventPost, base])
    expect(categoryOf(createDetectionRequests(post)[0]).instructions).toBe(defined.instructions)
})

test('質問文を言い換えた request は v19 としても v18 としても保存できない（質問文は版と対で固定）', async () => {
  await withJob('gift-card-v19-rephrased', async ({ env, token, target }) => {
    for (const post of [keyholderPost, giftPost]) {
      const rephrased = createDetectionRequests(post).map(withRephrasedSentence)
      for (const version of [V19, V18])
        await expect(saveWebhookPromptAttempt(env, target, token, version, rephrased)).rejects.toThrow(
          'Webhook request does not match its prompt version'
        )
    }
    // 拒否された試行は何も保存しない。
    expect((await getWebhookPrompt(env, base.id)).source).toBe('unavailable')
  })
}, 60000)

test('gift_card を出さない投稿の request は v19 としても v18 としても保存でき、gift_card を出す投稿は v19 としてだけ保存できる', async () => {
  await withJob('gift-card-v19-v18-compat', async ({ env, token, target }) => {
    const plain = createDetectionRequests(keyholderPost)
    const gift = createDetectionRequests(giftPost)
    // v18 の定義は category が固定の選択肢（gift_card を含まない）なので、gift_card を含む選択肢は v18 として保存できない。
    await expect(saveWebhookPromptAttempt(env, target, token, V18, gift)).rejects.toThrow(
      'Webhook request criteria do not match its prompt version'
    )
    expect((await getWebhookPrompt(env, base.id)).source).toBe('unavailable')
    // gift_card を出さない投稿は v18 の request と完全に同一（質問文も選択肢も説明も）なので、v18 としても保存できる。
    await saveWebhookPromptAttempt(env, target, token, V18, plain)
    expect(await getWebhookPrompt(env, base.id)).toMatchObject({ questionVersion: V18, requests: plain })
    await saveWebhookPromptAttempt(env, target, token, V19, plain)
    expect(await getWebhookPrompt(env, base.id)).toMatchObject({ questionVersion: V19, requests: plain })
    await saveWebhookPromptAttempt(env, target, token, V19, gift)
    expect(await getWebhookPrompt(env, base.id)).toMatchObject({ questionVersion: V19, requests: gift })
  })
}, 60000)
