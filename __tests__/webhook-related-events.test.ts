import { expect, test } from 'bun:test'
import { relatedWebhookEvents, webhookReferencedPostIds } from '@api/services/webhook-related-events'
import { event, makeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'

const sourceId = '2109221721773576390'
const post = () => ({ ...makeJob().post, id: '2110000000000000000' })

test('明示された元投稿IDだけを採り、短縮表示・不正ID・自分自身は補完しない', () => {
  expect(
    webhookReferencedPostIds({
      ...post(),
      text: `元告知 https://x.com/bic_akiba/status/${sourceId}?s=20`,
      quoted: { id: sourceId },
      replyTo: { id: '2110000000000000000', screenName: 'bic_akiba' }
    })
  ).toEqual([sourceId])
  expect(webhookReferencedPostIds({ ...post(), text: 'x.com/Bic_kawasaki/s… p', quoted: { id: 'invalid' } })).toEqual(
    []
  )
})

test('物品別の根拠に無い元告知参照も、保存された原文・引用文脈から保持する', () => {
  expect(
    webhookReferencedPostIds({
      ...post(),
      text: 'この名刺はまだあります',
      extractionContext: {
        kind: 'item',
        item: '限定名刺',
        evidence: ['この名刺はまだあります'],
        originalText: `元のお知らせ https://x.com/bic_akiba/status/${sourceId}`,
        quotedId: sourceId
      }
    })
  ).toEqual([sourceId])
})

test('参照投稿が登録済みイベントに直接一致した時だけ連携候補を返し、DBを変更しない', async () => {
  await withRejudgeEnv(async (env) => {
    await env.DB.prepare('INSERT INTO events(id,category,title,start_date,updated_at) VALUES (?,?,?,?,?)')
      .bind(event.uuid, 'limited_card', '元の名刺イベント', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')
      .run()
    for (const [index, url] of [
      `https://x.com/bic_akiba/status/${sourceId}`,
      `https://twitter.com/bic_akiba/status/${sourceId}?s=20`
    ].entries()) {
      await env.DB.prepare('INSERT INTO event_reference_urls(id,event_id,type,url,updated_at) VALUES (?,?,?,?,?)')
        .bind(crypto.randomUUID(), event.uuid, 'announce', url, `2026-10-11T00:00:0${index}.000Z`)
        .run()
    }
    const before = await env.DB.prepare('SELECT count(*) AS total FROM event_reference_urls').first<number>('total')
    const found = await relatedWebhookEvents(env, { ...post(), quoted: { id: sourceId } })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ eventId: event.uuid, title: '元の名刺イベント' })
    expect(await env.DB.prepare('SELECT count(*) AS total FROM event_reference_urls').first<number>('total')).toBe(
      before
    )
    expect(await env.DB.prepare('SELECT count(*) AS total FROM events').first<number>('total')).toBe(1)
  })
})

test('IDの前方一致や別ドメインのURLを元告知一致とみなさない', async () => {
  await withRejudgeEnv(async (env) => {
    await env.DB.prepare('INSERT INTO events(id,category,title,start_date,updated_at) VALUES (?,?,?,?,?)')
      .bind(event.uuid, 'limited_card', '類似名でも確定しない', '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')
      .run()
    for (const url of [
      `https://x.com/bic_akiba/status/${sourceId}0`,
      `https://example.invalid/bic_akiba/status/${sourceId}`
    ]) {
      await env.DB.prepare('INSERT INTO event_reference_urls(id,event_id,type,url,updated_at) VALUES (?,?,?,?,?)')
        .bind(crypto.randomUUID(), event.uuid, 'announce', url, '2026-10-11T00:00:00.000Z')
        .run()
    }
    expect(await relatedWebhookEvents(env, { ...post(), quoted: { id: sourceId } })).toEqual([])
    expect(await relatedWebhookEvents(env, post())).toEqual([])
  })
})
