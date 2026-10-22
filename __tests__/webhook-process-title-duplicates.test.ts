import { expect, spyOn, test } from 'bun:test'
import { getWebhookJob, insertWebhookJob } from '@api/services/webhook-jobs'
import {
  DEFAULT_TITLE,
  duplicateOf,
  processWebhookJob,
  slotOwners,
  titleHarness,
  titleToolInput
} from './fixtures/webhook-process'

test('a held job with a candidate (a duplicate post) gets the AI title while the slot stays with the first post', async () => {
  const harness = await titleHarness('webhook-title-held-candidate-test')
  try {
    const { env, ai, postOf, run } = harness
    ai.title.reply = titleToolInput('秋の名刺')
    const first = await run(postOf(12))
    expect(first.job.status).toBe('registered')
    expect(first.title).toBe('秋の名刺')
    expect(ai.titles).toHaveLength(1)
    // スロットは先の投稿が押さえている
    expect(await slotOwners(env)).toEqual([first.job.postId])
    ai.title.reply = titleToolInput('冬の名刺')
    const second = await run(duplicateOf(postOf(12), '1'))
    // 保留になり、登録候補の題は AI が付けた題になる（抽出名のままではない）。イベントは増えない
    expect(second.job.status).toBe('held')
    expect(second.job.eventId).toBeNull()
    expect(second.job.candidate?.title).toBe('冬の名刺')
    expect(second.job.candidates[0].candidate?.title).toBe('冬の名刺')
    expect(second.job.candidates[0].item).toBe('アキバたん 限定名刺配布')
    expect(second.job.reasons).toContain('title_generated')
    expect(second.job.reasons).not.toContain('title_fallback')
    expect(second.job.reasons.some((reason) => reason.startsWith('possible_duplicate:'))).toBe(true)
    expect(ai.titles).toHaveLength(2)
    expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
    // スロットは先の投稿のまま（保留の投稿が奪わない）
    expect(await slotOwners(env)).toEqual([first.job.postId])
  } finally {
    await harness.dispose()
  }
}, 60000)

test('a held job with a candidate keeps the extracted name as the title and the held status when the title request fails', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  const harness = await titleHarness('webhook-title-held-fallback-test')
  try {
    const first = await harness.run(harness.postOf(12))
    expect(first.job.status).toBe('registered')
    harness.ai.title.reply = () => new Response('{"error":"internal"}', { status: 500 })
    const failed = await harness.run(duplicateOf(harness.postOf(12), '1'))
    // 通信は 1 回だけ（再試行しない）。例外にもならず、抽出名のまま保留になる
    expect(harness.ai.titles).toHaveLength(2)
    expect(failed.job.status).toBe('held')
    expect(failed.job.candidate?.title).toBe(DEFAULT_TITLE)
    expect(failed.job.reasons).toContain('title_fallback')
    expect(failed.job.reasons).not.toContain('title_generated')
    expect(failed.job.reasons.some((reason) => reason.startsWith('possible_duplicate:'))).toBe(true)
  } finally {
    warn.mockRestore()
    await harness.dispose()
  }
}, 60000)

test('a held job with a candidate sends nothing and keeps the extracted name when the title API is not configured', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  const harness = await titleHarness('webhook-title-held-unconfigured-test', { secrets: false })
  try {
    const registered = await harness.run(harness.postOf(12))
    expect(registered.job.status).toBe('registered')
    expect(registered.job.reasons).toContain('title_fallback')
    const held = await harness.run(duplicateOf(harness.postOf(12), '1'))
    expect(held.job.status).toBe('held')
    expect(held.job.candidate?.title).toBe(DEFAULT_TITLE)
    expect(held.job.reasons).toContain('title_fallback')
    // 接続先・トークンが未登録の環境では、保留の候補でも通信しない
    expect(harness.ai.titles).toHaveLength(0)
  } finally {
    warn.mockRestore()
    await harness.dispose()
  }
}, 60000)

test('ignored jobs never send a title request even when a duplicate of the same post is held and titled', async () => {
  const harness = await titleHarness('webhook-title-ignored-test')
  try {
    const { ai, postOf, run } = harness
    // Clef が対象外と判定する投稿（登録候補が無い）。保留の題付けが広がっても、対象外には呼ばない
    const ignored = await run(postOf(21, 'こんにちは'))
    expect(ignored.job.status).toBe('ignored')
    expect(ignored.job.candidate).toBeNull()
    expect(ai.titles).toHaveLength(0)
    expect(ignored.job.reasons).not.toContain('title_generated')
    expect(ignored.job.reasons).not.toContain('title_fallback')
  } finally {
    await harness.dispose()
  }
}, 60000)

test('the title request does not carry the migrated name of a legacy single-job post (placeholder or old generated title)', async () => {
  // 旧形式の単一ジョブを移行すると、候補の名前（item）は登録候補の題（旧形式で作った題）か、無ければ仮の「既存配布物」になる。
  // どちらも抽出した配布物の名前ではないので、値ではなく移行の印で判定して、従来どおり本文から読み取らせる。
  const OLD_TITLE = '旧形式の生成題 アキバたん配布'
  const cases: [string, string | null, string][] = [
    ['登録候補が無い（仮の名前）', null, '既存配布物'],
    ['旧形式で作った題が候補の名前になる', OLD_TITLE, OLD_TITLE]
  ]
  for (const [index, [label, oldTitle, expectedItem]] of cases.entries()) {
    const harness = await titleHarness(`webhook-title-legacy-item-test-${index}`)
    try {
      const { env, ai, postOf } = harness
      const post = postOf(12)
      const inserted = await insertWebhookJob(env, post)
      // 旧形式の単一ジョブ: 判定結果は保存済み。登録候補があれば旧形式の題が入っている
      const detection = {
        category: 'limited_card',
        title: DEFAULT_TITLE,
        stores: ['akiba'],
        characterIds: ['akiba'],
        startDate: '2026-10-12',
        conditions: [{ type: 'everyone' }],
        referenceUrls: [{ type: 'start', url: post.url }],
        isPreliminary: false
      }
      const decision = { status: 'register', confidence: 0.99, reasons: [], candidate: detection }
      const stored =
        oldTitle === null
          ? null
          : JSON.stringify({
              uuid: inserted.eventUUID,
              category: 'limited_card',
              title: oldTitle,
              stores: ['akiba'],
              characterIds: ['akiba'],
              startDate: '2026-10-12T00:00:00+09:00',
              conditions: [{ uuid: crypto.randomUUID(), type: 'everyone' }],
              referenceUrls: [{ uuid: crypto.randomUUID(), type: 'announce', url: post.url }],
              isVerified: true,
              isPreliminary: false,
              shouldTweet: false
            })
      await env.DB.prepare('UPDATE webhook_event_jobs SET result_json=?,candidate_json=? WHERE post_id=?')
        .bind(JSON.stringify(decision), stored, post.id)
        .run()
      await processWebhookJob(env, post.id, { titleFetcher: ai.fetcher })
      const job = await getWebhookJob(env, post.id)
      expect(job.candidates[0].item, label).toBe(expectedItem)
      expect(job.status, label).toBe('registered')
      expect(job.reasons, label).toContain('title_generated')
      // 移行後の名前を「配布物の名前」として渡さず、従来の文言にする
      expect(ai.titles, label).toHaveLength(1)
      const [message] = ai.titles[0].body.messages
      expect(message.content, label).toContain('配布物の名前: 事前に抽出したものはありません')
      expect(message.content, label).not.toContain(expectedItem)
      expect(message.content, label).not.toContain('この配布物の題だけを付ける')
    } finally {
      await harness.dispose()
    }
  }
}, 120000)
