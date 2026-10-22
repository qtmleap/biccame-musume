import { expect, mock, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import adminWebhookRoutes from '@api/routes/admin-webhook'
import { rejudgeWebhookJob, resolveWebhookJob } from '@api/services/webhook-admin'
import { claimWebhookJob, getWebhookJob, insertWebhookJob, webhookTarget } from '@api/services/webhook-jobs'
import {
  getWebhookPrompt,
  registerWebhookPromptDefinition,
  saveWebhookPromptAttempt
} from '@api/services/webhook-prompt'
import type { Bindings } from '@api/types/bindings'
import type { ClefRequest } from '@biccame/shared/event-detect/clef'
import { createDetectionRequests, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import { createItemCountRequest, EXTRACTION_VERSION } from '@biccame/shared/event-detect/extraction'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { webhookPromptDefinition } from '@biccame/shared/event-detect/prompt-definitions'
import { WebhookPromptSchema } from '@biccame/shared/schemas/webhook.dto'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const request: ClefRequest = {
  model: 'clef',
  state: '実際の配布物の原文',
  questions: { is_event: { type: 'noul', instructions: '配布イベントですか？' } }
}
const post = (id: string): DetectPost => ({
  id,
  text: '本日から限定名刺を全員に配布します。',
  screenName: 'bic_akiba',
  kind: 'original',
  createdAt: '2026-10-20T00:00:00Z',
  url: `https://x.com/bic_akiba/status/${id}`,
  media: []
})
const withDb = async (run: (env: Bindings) => Promise<void>) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'webhook-prompt-history',
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-05-11',
      d1Databases: ['DB']
    })
  )
  try {
    const env = Object.assign(await mf.getBindings<Bindings>(), { EVENT_DETECTION_QUEUE: { send: async () => {} } })
    const directories = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const directory of directories) {
      const sql = await readFile(`prisma/migrations/${directory}/migration.sql`, 'utf8')
      await env.DB.exec(sql.replace(/^--.*$/gm, '').replace(/\n/g, ' '))
    }
    await run(env)
  } finally {
    await mf.dispose()
  }
}

test('生成された現行版定義は実際の質問文と固定選択肢を保持する', () => {
  const definition = webhookPromptDefinition(DETECTION_VERSION)
  if (definition === undefined) throw new Error('Missing current prompt definition')
  const requests = createDetectionRequests(post('2112431406978945270'))
  // 現行版の店舗は固定の選択肢（44店舗 + multiple + none）。投稿ごとに変わるのは日付・数量・金額だけ。
  const dynamic = ['start_date', 'end_date', 'quantity', 'purchase_amount', 'charge_amount']
  const extractionDefinition = webhookPromptDefinition(EXTRACTION_VERSION)
  const count = createItemCountRequest(post('2112431406978945270')).questions.distribution_item_count
  expect(extractionDefinition?.questionVersion).toBe(EXTRACTION_VERSION)
  expect(extractionDefinition?.questions.find((entry) => entry.key === 'distribution_item_count')?.instructions).toBe(
    count.instructions
  )
  for (const request of requests) {
    for (const [key, question] of Object.entries(request.questions)) {
      const template = definition.questions.find((entry) => entry.key === key)
      expect(template?.type).toBe(question.type)
      expect(template?.instructions).toBe(question.instructions)
      if (question.type === 'choice' && !dynamic.includes(key)) {
        for (const [option, label] of Object.entries(question.criteria)) expect(template?.criteria[option]).toBe(label)
      }
    }
  }
})

test('旧履歴はD1の当時版定義を返し、実入力記録と区別して候補を投稿IDで照合する', async () => {
  await withDb(async (env) => {
    const id = '2112431406978945270'
    await insertWebhookJob(env, post(id))
    await env.DB.prepare('UPDATE webhook_event_jobs SET question_version=? WHERE post_id=?')
      .bind('v2-webhook-v4', id)
      .run()
    const historical = await getWebhookPrompt(env, id)
    expect(historical).toMatchObject({ questionVersion: 'v2-webhook-v4', requests: [], source: 'definition' })
    expect(historical.definition?.origin).toBe('git:61f22bcd')
    expect(historical.definition?.questions.some((question) => question.key === 'is_event')).toBe(true)
    expect(historical.definition?.questions.some((question) => question.key.startsWith('character.'))).toBe(false)
    expect(historical.definition?.stateTemplate).toContain('{{保存された投稿本文}}')
    const candidateId = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO webhook_event_candidates
      (event_uuid,post_id,item,post_json,source_url,status,lease_token,created_at,updated_at)
      SELECT ?,post_id,'限定名刺',post_json,source_url,'processing','owned',created_at,updated_at
      FROM webhook_event_jobs WHERE post_id=?`)
      .bind(candidateId, id)
      .run()
    const actualRequest = createDetectionRequests(post(id))[0]
    const definition = webhookPromptDefinition(DETECTION_VERSION)
    if (definition === undefined) throw new Error('Missing current definition')
    const input = { ...actualRequest, headers: { Authorization: 'synthetic-value-not-to-store' } }
    await saveWebhookPromptAttempt(env, webhookTarget(id, candidateId), 'owned', DETECTION_VERSION, [input])
    const route = (path: string) => adminWebhookRoutes.request(path, undefined, env)
    const response = await route(`/admin/webhook/jobs/${id}/prompt?candidateId=${candidateId}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const parsed = WebhookPromptSchema.safeParse(await response.json())
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw new Error('Invalid prompt response')
    expect(parsed.data).toEqual({
      questionVersion: DETECTION_VERSION,
      requests: [actualRequest],
      source: 'recorded',
      definition
    })
    expect(JSON.stringify(parsed.data)).not.toContain('Authorization')
    expect((await route(`/admin/webhook/jobs/999/prompt?candidateId=${candidateId}`)).status).toBe(404)
    expect((await route(`/admin/webhook/jobs/${id}/prompt?candidateId=invalid`)).status).toBe(400)
    expect((await route('/admin/webhook/jobs/999/prompt')).status).toBe(404)
  })
}, 60000)

test('未生成の新版はスナップショット保存と送信を始める前に拒否する', async () => {
  await withDb(async (env) => {
    const id = '2112431406978945290'
    await insertWebhookJob(env, post(id))
    const token = await claimWebhookJob(env, id)
    if (token === null) throw new Error('Missing lease')
    const send = mock(async () => {})
    await expect(
      (async () => {
        await saveWebhookPromptAttempt(env, webhookTarget(id), token, 'ungenerated-version', [request])
        await send()
      })()
    ).rejects.toThrow('prompt definition is missing')
    expect(send).not.toHaveBeenCalled()
    expect(await getWebhookPrompt(env, id)).toEqual({
      questionVersion: null,
      requests: [],
      source: 'unavailable',
      definition: null
    })
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM webhook_prompt_versions WHERE version=?')
        .bind('ungenerated-version')
        .first<number>('count')
    ).toBe(0)
  })
}, 60000)

test('D1の版定義は再登録しても不変で、同版の定義変更を拒否する', async () => {
  await withDb(async (env) => {
    await registerWebhookPromptDefinition(env, DETECTION_VERSION)
    const before = await env.DB.prepare('SELECT definition_json FROM webhook_prompt_versions WHERE version=?')
      .bind(DETECTION_VERSION)
      .first<string>('definition_json')
    await registerWebhookPromptDefinition(env, DETECTION_VERSION)
    const after = await env.DB.prepare('SELECT definition_json FROM webhook_prompt_versions WHERE version=?')
      .bind(DETECTION_VERSION)
      .first<string>('definition_json')
    expect(after).toBe(before)
    await env.DB.prepare(
      "UPDATE webhook_prompt_versions SET definition_json=json_set(definition_json,'$.origin','changed') WHERE version=?"
    )
      .bind(DETECTION_VERSION)
      .run()
    await expect(registerWebhookPromptDefinition(env, DETECTION_VERSION)).rejects.toThrow('without a version change')
    const preserved = await env.DB.prepare('SELECT definition_json FROM webhook_prompt_versions WHERE version=?')
      .bind(DETECTION_VERSION)
      .first<string>('definition_json')
    expect(preserved).toContain('changed')
  })
}, 60000)

test('未知の旧版を現行の質問で捏造せず、実入力はその版のD1定義と一緒に返す', async () => {
  await withDb(async (env) => {
    const id = '2112431406978945278'
    await insertWebhookJob(env, post(id))
    await env.DB.prepare('UPDATE webhook_event_jobs SET question_version=? WHERE post_id=?')
      .bind('unknown-version', id)
      .run()
    expect(await getWebhookPrompt(env, id)).toEqual({
      questionVersion: 'unknown-version',
      requests: [],
      source: 'unavailable',
      definition: null
    })
    const token = await claimWebhookJob(env, id)
    if (token === null) throw new Error('Missing lease')
    const actualRequests = createDetectionRequests(post(id))
    await saveWebhookPromptAttempt(env, webhookTarget(id), token, DETECTION_VERSION, actualRequests)
    const saved = await getWebhookPrompt(env, id)
    expect(saved.source).toBe('recorded')
    expect(saved.requests).toEqual(actualRequests)
    await expect(saveWebhookPromptAttempt(env, webhookTarget(id), token, DETECTION_VERSION, [request])).rejects.toThrow(
      'does not match its prompt version'
    )
    expect((await getWebhookPrompt(env, id)).requests).toEqual(actualRequests)
    expect(saved.definition?.questionVersion).toBe(DETECTION_VERSION)
    // 現行版は店舗とビッカメ娘を choice 1 問ずつで尋ねる。選択肢は版ごとに固定で、定義にそのまま載る。
    const optionCount = (key: string) =>
      saved.definition?.questions
        .filter((question) => question.key === key)
        .flatMap((question) => Object.keys(question.criteria)).length
    expect(optionCount('store')).toBe(46)
    expect(optionCount('character')).toBe(55)
    expect(saved.definition?.questions.some((question) => /^(venue|character)\./.test(question.key))).toBe(false)
  })
}, 60000)

test('リースを失った送信試行は保存できず、別のワーカーのプロンプトを上書きしない', async () => {
  await withDb(async (env) => {
    const id = '2112431406978945271'
    await insertWebhookJob(env, post(id))
    const token = await claimWebhookJob(env, id)
    if (token === null) throw new Error('Missing lease')
    const actualRequests = createDetectionRequests(post(id))
    const definition = webhookPromptDefinition(DETECTION_VERSION)
    if (definition === undefined) throw new Error('Missing current definition')
    await saveWebhookPromptAttempt(env, webhookTarget(id), token, DETECTION_VERSION, actualRequests)
    await expect(
      saveWebhookPromptAttempt(env, webhookTarget(id), 'stale', DETECTION_VERSION, actualRequests)
    ).rejects.toThrow('Webhook prompt lease lost')
    expect(await getWebhookPrompt(env, id)).toEqual({
      questionVersion: DETECTION_VERSION,
      requests: actualRequests,
      source: 'recorded',
      definition
    })
  })
}, 60000)

test('対象外の親・子候補から既存へ手動連携でき、既存イベントを変更しない', async () => {
  await withDb(async (env) => {
    const eventId = crypto.randomUUID()
    await env.DB.prepare(
      "INSERT INTO events (id,category,title,start_date,updated_at) VALUES (?,'other','既存イベント','2026-11-07T00:00:00+09:00','2026-10-20T00:00:00Z')"
    )
      .bind(eventId)
      .run()
    const before = await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first()
    for (const [index, withCandidate] of [false, true].entries()) {
      const id = `211243140697894528${index}`
      await insertWebhookJob(env, post(id))
      await env.DB.prepare(
        "UPDATE webhook_event_jobs SET status='ignored',reasons_json='[\"non_store_account\"]' WHERE post_id=?"
      )
        .bind(id)
        .run()
      const candidateId = crypto.randomUUID()
      if (withCandidate) {
        await env.DB.prepare(`INSERT INTO webhook_event_candidates
          (event_uuid,post_id,item,post_json,source_url,status,reasons_json,created_at,updated_at)
          SELECT ?,post_id,'配布物',post_json,source_url,'ignored','["not_distribution_event"]',created_at,updated_at
          FROM webhook_event_jobs WHERE post_id=?`)
          .bind(candidateId, id)
          .run()
      }
      const result = await resolveWebhookJob(env, id, {
        action: 'link',
        eventId,
        ...(withCandidate ? { candidateId } : {})
      })
      expect(result.status).toBe('registered')
      expect(result.eventId).toBe(eventId)
      expect(result.reasons).toContain('manually_linked')
      expect(
        await env.DB.prepare('SELECT count(*) AS count FROM event_reference_urls WHERE event_id=? AND url=?')
          .bind(eventId, post(id).url)
          .first<number>('count')
      ).toBe(1)
      expect(JSON.stringify(await env.DB.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first())).toBe(
        JSON.stringify(before)
      )
    }
  })
}, 60000)

test('対象外の連携でも処理中リース・誤候補・存在しないイベントを拒否し、他操作は許可しない', async () => {
  await withDb(async (env) => {
    const id = '2112431406978945289'
    await insertWebhookJob(env, post(id))
    await env.DB.prepare("UPDATE webhook_event_jobs SET status='ignored' WHERE post_id=?").bind(id).run()
    const eventId = crypto.randomUUID()
    await expect(resolveWebhookJob(env, id, { action: 'link', eventId })).rejects.toMatchObject({ status: 404 })
    await expect(resolveWebhookJob(env, id, { action: 'reject' })).rejects.toMatchObject({ status: 409 })
    await expect(
      resolveWebhookJob(env, id, {
        action: 'register',
        event: {
          uuid: crypto.randomUUID(),
          category: 'other',
          title: '登録しない',
          stores: ['akiba'],
          characterIds: ['akiba'],
          startDate: '2026-11-07T00:00:00+09:00',
          isVerified: true,
          isPreliminary: false,
          conditions: [],
          referenceUrls: [],
          shouldTweet: false
        }
      })
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      resolveWebhookJob(env, id, { action: 'link', eventId, candidateId: crypto.randomUUID() })
    ).rejects.toMatchObject({ status: 404 })
    await env.DB.prepare(
      "INSERT INTO events (id,category,title,start_date,updated_at) VALUES (?,'other','既存','2026-11-07','2026-10-20')"
    )
      .bind(eventId)
      .run()
    await env.DB.prepare("UPDATE webhook_event_jobs SET lease_token='worker',lease_until=9999999999999 WHERE post_id=?")
      .bind(id)
      .run()
    await expect(resolveWebhookJob(env, id, { action: 'link', eventId })).rejects.toMatchObject({ status: 409 })
    expect((await getWebhookJob(env, id)).status).toBe('ignored')
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM event_reference_urls WHERE event_id=?')
        .bind(eventId)
        .first<number>('count')
    ).toBe(0)
  })
}, 60000)

test('親・候補の再判定は古いプロンプトを消し、新しい版の記録ができるまで空配列を返す', async () => {
  await withDb(async (env) => {
    const id = '2112431406978945272'
    await insertWebhookJob(env, post(id))
    await env.DB.prepare(
      "UPDATE webhook_event_jobs SET status='held',requests_json=?,question_version='old' WHERE post_id=?"
    )
      .bind(JSON.stringify({ questionVersion: 'old', requests: [request] }), id)
      .run()
    await rejudgeWebhookJob(env, id)
    expect(await getWebhookPrompt(env, id)).toEqual({
      questionVersion: null,
      requests: [],
      source: 'unavailable',
      definition: null
    })
    const candidateId = crypto.randomUUID()
    await env.DB.prepare(`INSERT INTO webhook_event_candidates
      (event_uuid,post_id,item,post_json,source_url,status,requests_json,question_version,created_at,updated_at)
      SELECT ?,post_id,'限定名刺',post_json,source_url,'held',?,'old',created_at,updated_at
      FROM webhook_event_jobs WHERE post_id=?`)
      .bind(candidateId, JSON.stringify({ questionVersion: 'old', requests: [request] }), id)
      .run()
    await rejudgeWebhookJob(env, id, candidateId)
    expect(await getWebhookPrompt(env, id, candidateId)).toEqual({
      questionVersion: null,
      requests: [],
      source: 'unavailable',
      definition: null
    })
  })
}, 60000)
