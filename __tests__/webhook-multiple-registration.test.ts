import { expect, spyOn, test } from 'bun:test'
import * as discord from '@api/services/discord'
import { rejudgeWebhookJob, resolveWebhookJob, retryWebhookJob } from '@api/services/webhook-admin'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import type { EventDetectionNotification } from '@biccame/shared/bot'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { fixture, makePost, migrate } from './fixtures/webhook-multiple-events'

// モデルの文章理解を偽装せず、抽出された原文断片を使った保存・分割・再試行を検証する。
test('同カテゴリの2配布物を独立登録し、同投稿URLと再試行でも潰さない', async () => {
  const { cleanup, env, calls } = await fixture('multiple-giveaway-registration')
  const notifications: EventDetectionNotification[] = []
  const delivery = spyOn(discord, 'notifyEventDetection').mockImplementation(async (_env, input) => {
    notifications.push(input)
    return { status: 'sent', messageId: '1234567890' }
  })
  try {
    await migrate(env.DB)
    const red = '本日から赤い限定名刺をどなたでも配布します。'
    const blue = '本日から青い限定名刺をどなたでも配布します。'
    const post = makePost('2109221721773576390', `${red}\n${blue}`)
    const extractor = async () => ({
      events: [
        { item: '赤い限定名刺', stores: [], characterIds: [], evidence: [red] },
        { item: '青い限定名刺', stores: [], characterIds: [], evidence: [blue] }
      ]
    })
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, { extractor })
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('registered')
    expect(saved.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
    expect(new Set(saved.candidates.map((candidate) => candidate.eventUUID)).size).toBe(2)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS total FROM event_reference_urls WHERE url=?')
        .bind(post.url)
        .first<number>('total')
    ).toBe(2)
    expect(calls).toHaveLength(2)
    expect(notifications.map((notification) => notification.candidate?.total)).toEqual([2, 2])
    expect(notifications.map((notification) => notification.candidate?.index)).toEqual([1, 2])
    await processWebhookJob(env, post.id, {
      extractor: async () => {
        throw new Error('Must not extract again')
      }
    })
    expect(calls).toHaveLength(2)
    expect(notifications).toHaveLength(2)
    const duplicate = makePost('2109221721773576391', post.text)
    await insertWebhookJob(env, duplicate)
    await processWebhookJob(env, duplicate.id, { extractor })
    expect((await getWebhookJob(env, duplicate.id)).candidates.map((candidate) => candidate.status)).toEqual([
      'held',
      'held'
    ])
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('片方の情報不足・再判定・手動解決で成功済み候補を変更しない', async () => {
  const { cleanup, env, calls } = await fixture('multiple-giveaway-partial')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    const key = '10/16から3,000円以上ご購入でハロウィンアクリルキーホルダ―をプレゼントします。'
    const card = 'ハロウィン限定名刺も用意しています。'
    const post = makePost('2109221721773576392', `${key}\n${card}`)
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [
          { item: 'ハロウィンアクキー', stores: [], characterIds: [], evidence: [key] },
          { item: 'ハロウィン限定名刺', stores: [], characterIds: [], evidence: [card] }
        ]
      })
    })
    const saved = await getWebhookJob(env, post.id)
    expect(saved.status).toBe('held')
    const registered = saved.candidates[0]
    const held = saved.candidates[1]
    expect(registered.status).toBe('registered')
    expect(registered.candidate?.category).toBe('ackey')
    expect(registered.candidate?.conditions[0].purchaseAmount).toBe(3000)
    expect(held.status).toBe('held')
    expect(held.reasons).toContain('start_date_unspecified')
    // 条件の語が無い本文は全員配布として扱うので、条件未記載の保留理由は付かない（開始日の未記載だけが理由）。
    expect(held.reasons).not.toContain('distribution_condition_unspecified')
    expect(held.reasons).not.toContain('multiple_or_ambiguous_events')
    expect(held.post.text).not.toContain('3,000円')
    await expect(resolveWebhookJob(env, post.id, { action: 'reject' })).rejects.toThrow('Select a webhook candidate')
    await rejudgeWebhookJob(env, post.id, held.eventUUID)
    await processWebhookJob(env, post.id)
    expect(calls).toHaveLength(3)
    const rejudged = await getWebhookJob(env, post.id)
    expect(rejudged.candidates[0].eventId).toBe(registered.eventId)
    expect(rejudged.candidates[1].eventUUID).toBe(held.eventUUID)
    if (registered.candidate === null) throw new Error('Expected candidate')
    const event = {
      ...registered.candidate,
      uuid: held.eventUUID,
      category: 'limited_card' as const,
      title: 'ハロウィン限定名刺',
      conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' as const }],
      referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce' as const, url: post.url }]
    }
    await resolveWebhookJob(env, post.id, { action: 'register', candidateId: held.eventUUID, event })
    await processWebhookJob(env, post.id)
    const resolved = await getWebhookJob(env, post.id)
    expect(resolved.status).toBe('registered')
    expect(resolved.candidates[0].eventId).toBe(registered.eventId)
    expect(resolved.candidates[1].candidate?.conditions).toEqual(event.conditions)
    expect(calls).toHaveLength(3)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('同配布物でも日付・購入条件が違えば別候補、失敗した候補だけを再試行する', async () => {
  const { cleanup, env, calls, state } = await fixture('multiple-giveaway-retry')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    const first = '10/16から1,000円以上購入で記念限定名刺を配布します。'
    const second = '10/16から3,000円以上購入で記念限定名刺を配布します。'
    const post = makePost('2109221721773576393', `${first}\n${second}`)
    state.fail = '3,000円'
    await insertWebhookJob(env, post)
    await expect(
      processWebhookJob(env, post.id, {
        extractor: async () => ({
          events: [
            { item: '記念限定名刺', stores: [], characterIds: [], evidence: [first] },
            { item: '記念限定名刺', stores: [], characterIds: [], evidence: [second] }
          ]
        })
      })
    ).rejects.toThrow('Synthetic candidate failure')
    const partial = await getWebhookJob(env, post.id)
    expect(partial.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'failed'])
    state.fail = ''
    await retryWebhookJob(env, post.id, {
      notificationOnly: false,
      allowUnknown: false,
      candidateId: partial.candidates[1].eventUUID
    })
    await processWebhookJob(env, post.id)
    const done = await getWebhookJob(env, post.id)
    expect(done.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
    expect(done.candidates.map((candidate) => candidate.candidate?.conditions[0].purchaseAmount)).toEqual([1000, 3000])
    expect(done.candidates[0].eventId).toBe(partial.candidates[0].eventId)
    expect(calls).toHaveLength(3)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)

test('合同開催（複数店舗）は店舗ごとの候補・イベントに分け、同一候補の並行処理は重複登録しない', async () => {
  const { cleanup, env } = await fixture('multiple-giveaway-stores')
  const delivery = spyOn(discord, 'notifyEventDetection').mockResolvedValue({ status: 'sent', messageId: '1234567890' })
  try {
    await migrate(env.DB)
    // 対象の娘は 1 人（アキバたん）。2 店舗で配る 1 件の抽出イベントが、店舗ごとの 2 候補 → 2 イベントになる。
    // 娘が複数いる共同デザインは multiple で保留になる（webhook-multiple-events.test.ts）。
    const text = 'アキバたんの限定名刺を、秋葉原店とあべの店で本日からどなたでも配布します。'
    const post = makePost('2109221721773576394', text)
    await insertWebhookJob(env, post)
    await processWebhookJob(env, post.id, {
      extractor: async () => ({
        events: [{ item: '合同限定名刺', stores: ['akiba', 'abeno'], characterIds: ['akiba'], evidence: [text] }]
      })
    })
    const job = await getWebhookJob(env, post.id)
    expect(job.candidates.map((candidate) => candidate.item)).toEqual(['合同限定名刺', '合同限定名刺'])
    expect(job.candidates.map((candidate) => candidate.storeKey)).toEqual(['akiba', 'abeno'])
    expect(job.candidates.map((candidate) => candidate.status)).toEqual(['registered', 'registered'])
    expect(job.candidates.map((candidate) => candidate.candidate?.stores)).toEqual([['akiba'], ['abeno']])
    expect(job.candidates.map((candidate) => candidate.candidate?.characterIds)).toEqual([['akiba'], ['akiba']])
    expect(new Set(job.candidates.map((candidate) => candidate.eventUUID)).size).toBe(2)
    // 店舗違いは重複扱いにならない（互いに possible_duplicate を付けない）。
    for (const candidate of job.candidates)
      expect(candidate.reasons.filter((reason) => reason.startsWith('possible_duplicate'))).toEqual([])
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM events').first<number>('total')).toBe(2)
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM event_stores').first<number>('total')).toBe(2)
    // 抽出の保存形式は分割しない（1 件のまま stores が 2 つ）。件数監査の数は抽出イベントの数。
    const stored = await env.DB.prepare('SELECT extraction_json FROM webhook_event_jobs WHERE post_id=?')
      .bind(post.id)
      .first<string>('extraction_json')
    expect(stored === null ? [] : JSON.parse(stored).events).toHaveLength(1)
    expect(job.itemCountAudit).toMatchObject({ extracted: 1, candidates: 1, status: 'matched' })
    const repeated = [
      makePost('2109221721773576395', '本日から競合限定名刺をどなたでも配布します。'),
      makePost('2109221721773576396', '本日から競合限定名刺をどなたでも配布します。')
    ]
    for (const value of repeated) await insertWebhookJob(env, value)
    const extractor = async (value: DetectPost) => ({
      events: [{ item: '競合限定名刺', stores: [], characterIds: [], evidence: [value.text] }]
    })
    await Promise.allSettled(repeated.map((value) => processWebhookJob(env, value.id, { extractor })))
    for (const value of repeated) await processWebhookJob(env, value.id)
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS total FROM events WHERE title='競合限定名刺'").first<number>('total')
    ).toBe(1)
  } finally {
    delivery.mockRestore()
    await cleanup()
  }
}, 60000)
