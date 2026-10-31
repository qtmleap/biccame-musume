import { expect, test } from 'bun:test'
import { candidateRow, judgedReasons, judgeIn, seedLinkable, setupAuto } from './fixtures/webhook-auto-link'
import { references } from './fixtures/webhook-link-ended'
import { candidateOf, judge, seedEvent } from './fixtures/webhook-linked-event'

// 保留の理由が状態（event_ended / existing_event_update）だけのときだけ自動連携する。店舗・娘など、ほかの理由が 1 つでもあれば、
// 提案の確率が高くても人が見る（保留のまま、提案は保存し、通常どおり通知する）。

test('店舗が確定できない（store_unconfirmed）終了の投稿は、提案が 0.95 でも自動連携しない', async () => {
  const value = await setupAuto('auto-link-store-unconfirmed', 'end')
  try {
    await seedEvent(value.env, 1, 'tachikawa')
    // 店舗の確率も確認の「はい」も下限未満で採用されないが、投稿アカウントの店舗（立川店）で 3 段目は聞かれ、提案が保存される。
    value.state.picks = { store: 'tachikawa', probability: 0.656 }
    value.confirm.yes = 0.6446
    const post = await judge(value, '2114255692517564858', [], 'bic_tachikawa')
    const reasons = await judgedReasons(value, post.id)
    expect(reasons).toEqual(expect.arrayContaining(['event_ended', 'store_unconfirmed']))
    expect(reasons.length).toBeGreaterThan(1)
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.95)
    expect(value.delivery).toHaveBeenCalledTimes(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('対象のビッカメ娘が確定できない（character_unconfirmed）継続の投稿は、提案が 0.95 でも自動連携しない', async () => {
  const value = await setupAuto('auto-link-character-unconfirmed', 'ongoing')
  try {
    const target = await seedLinkable(value, 1)
    value.state.picks = { character: 'none' }
    const post = await judgeIn(value.env, '2112378276735760011')
    const reasons = await judgedReasons(value, post.id)
    expect(reasons).toEqual(expect.arrayContaining(['existing_event_update', 'character_unconfirmed']))
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.95)
    expect(await references(value.env, target.eventId)).toEqual([{ type: 'announce', url: target.announceUrl }])
  } finally {
    await value.cleanup()
  }
}, 60000)

test('配布物の種類が確定できない（category_unconfirmed）終了の投稿は、3 段目が高い確率の提案を返しても自動連携しない', async () => {
  const value = await setupAuto('auto-link-category-unconfirmed', 'end')
  try {
    await seedLinkable(value, 1)
    // 種類は最上位の選択肢だけで決まる（確率は見ない）ので、3 段目は聞かれて 0.95 の提案が保存される。種類の確率がしきい値未満なので理由が足される。
    value.category.probability = 0.5
    const post = await judgeIn(value.env, '2112378276735760012')
    expect(await judgedReasons(value, post.id)).toEqual(['event_ended', 'category_unconfirmed'])
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.95)
    expect((await candidateRow(value, post.id))?.notification_status).toBe('sent')
  } finally {
    await value.cleanup()
  }
}, 60000)
