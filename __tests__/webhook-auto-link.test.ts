import { expect, test } from 'bun:test'
import dayjs from 'dayjs'
import {
  candidateRow,
  ENDED_AT,
  eventRow,
  judgedReasons,
  judgeIn,
  seedLinkable,
  setupAuto
} from './fixtures/webhook-auto-link'
import { references, snapshotOf, socialJobs } from './fixtures/webhook-link-ended'
import { CONTINUING, candidateOf, eventId, judge, seedEvent } from './fixtures/webhook-linked-event'

// 終了・継続の投稿は、提案の確率が共通のしきい値（既定 0.9）以上で、保留の理由が状態だけのとき、提案の連携先へ自動で連携する。
// 連携の書き込みは手動の連携（resolveWebhookJob の link）と同じ処理で、通知は出さない（notification_status は skipped）。

const ENDED_POST = '2112378276735760001'
const ONGOING_POST = '2112378276735760002'

test('終了の投稿・提案 0.95・理由が event_ended だけなら自動連携し、連携先の終了と更新投稿まで反映して、通知は出さない', async () => {
  const value = await setupAuto('auto-link-ended', 'end')
  try {
    const target = await seedLinkable(value, 1)
    const before = await eventRow(value, target.eventId)
    const post = await judgeIn(value.env, ENDED_POST)
    // 判定の理由は状態の理由だけ。連携すると、ジョブ行の理由は auto_linked に置き換わる。
    expect(await judgedReasons(value, post.id)).toEqual(['event_ended'])
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({
      status: 'registered',
      eventId: target.eventId,
      reasons: ['auto_linked'],
      notificationStatus: 'skipped',
      lastError: null
    })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.95)
    expect(await candidateRow(value, post.id)).toMatchObject({ notification_status: 'skipped' })
    // 連携先: ended_at は投稿日の日本時間 0 時、end 参照URL、updated_at が進む。
    const after = await eventRow(value, target.eventId)
    expect(after?.ended_at).toBe(ENDED_AT)
    expect(dayjs(String(after?.updated_at)).isAfter(dayjs(String(before?.updated_at)))).toBe(true)
    expect(await references(value.env, target.eventId)).toEqual([
      { type: 'announce', url: target.announceUrl },
      { type: 'end', url: post.url }
    ])
    // 更新投稿は有効なチャネル（x）だけ。引用先は終了ツイート。batch の成功後に即時回収でキューへ送られる。
    const rows = await socialJobs(value.env)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ channel: 'x', status: 'pending' })
    const snapshot = snapshotOf(rows[0])
    expect(snapshot.kind).toBe('updated')
    expect(snapshot.quoteTweetId).toBe(post.id)
    expect(value.sent).toContainEqual({ kind: 'social', jobId: rows[0].id })
    // Discord には何も送らない。
    expect(value.delivery).not.toHaveBeenCalled()
  } finally {
    await value.cleanup()
  }
}, 60000)

test('更新投稿は有効なチャネルごとに 1 件ずつ。両方有効なら X と Discord が同じキーで予約される', async () => {
  const value = await setupAuto('auto-link-channels', 'end', { x: 'true', discord: 'true' })
  try {
    await seedLinkable(value, 1)
    await judgeIn(value.env, ENDED_POST)
    const rows = await socialJobs(value.env)
    expect(rows.map((row) => row.channel)).toEqual(['discord', 'x'])
    expect(new Set(rows.map((row) => row.key)).size).toBe(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('継続の投稿・提案 0.95 なら自動連携するが、ended_at も終了の参照URLも更新投稿も書かない', async () => {
  const value = await setupAuto('auto-link-ongoing', 'ongoing')
  try {
    const target = await seedLinkable(value, 1)
    const before = await eventRow(value, target.eventId)
    const post = await judgeIn(value.env, ONGOING_POST, { text: CONTINUING })
    expect(await judgedReasons(value, post.id)).toEqual(['existing_event_update'])
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({
      status: 'registered',
      eventId: target.eventId,
      reasons: ['auto_linked'],
      notificationStatus: 'skipped'
    })
    expect(await eventRow(value, target.eventId)).toEqual(before)
    expect(await references(value.env, target.eventId)).toEqual([
      { type: 'announce', url: target.announceUrl },
      { type: 'announce', url: post.url }
    ])
    expect(await socialJobs(value.env)).toHaveLength(0)
    expect(value.delivery).not.toHaveBeenCalled()
  } finally {
    await value.cleanup()
  }
}, 60000)

// 本番の実データの3パターン。継続の投稿（提案 97.4%・理由は existing_event_update だけ）と終了の投稿（提案 95.8%・理由は状態だけ）は連携し、
// 同じ投稿のもう 1 つの候補（理由に category_unconfirmed があり提案なし）は保留のまま。
test('実データ: 継続・理由は existing_event_update だけ・0.9741 なら連携する', async () => {
  const value = await setupAuto('auto-link-real-ongoing', 'ongoing')
  try {
    const target = await seedLinkable(value, 1)
    value.linked.probability = 0.9741
    const post = await judgeIn(value.env, ONGOING_POST, { text: CONTINUING })
    expect(await judgedReasons(value, post.id)).toEqual(['existing_event_update'])
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'registered', eventId: target.eventId, reasons: ['auto_linked'] })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.9741)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('実データ: 終了・0.9576 なら連携する', async () => {
  const value = await setupAuto('auto-link-real-ended', 'end')
  try {
    const target = await seedLinkable(value, 1)
    value.linked.probability = 0.9576
    const post = await judgeIn(value.env, ENDED_POST)
    expect(await judgedReasons(value, post.id)).toEqual(['event_ended'])
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'registered', eventId: target.eventId, reasons: ['auto_linked'] })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.9576)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('実データ: 継続・理由に category_unconfirmed を含み提案なしなら、保留のまま連携しない', async () => {
  const value = await setupAuto('auto-link-real-category', 'ongoing')
  try {
    const target = await seedLinkable(value, 1)
    // 配布物の確率がしきい値未満で category_unconfirmed になり、3 段目も該当なしを選ぶ。
    value.category.probability = 0.5
    value.linked.pick = 'none'
    value.linked.probability = 0.99
    const post = await judgeIn(value.env, ONGOING_POST, { text: CONTINUING })
    expect(await judgedReasons(value, post.id)).toEqual(['existing_event_update', 'category_unconfirmed'])
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null, notificationStatus: 'sent' })
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(candidate.reasons).toEqual(expect.arrayContaining(['existing_event_update', 'category_unconfirmed']))
    expect(await references(value.env, target.eventId)).toEqual([{ type: 'announce', url: target.announceUrl }])
  } finally {
    await value.cleanup()
  }
}, 60000)

test('提案が 0.8（提案の下限 0.7 以上・しきい値 0.9 未満）なら保留のまま、提案は保存され、通常どおり通知する', async () => {
  const value = await setupAuto('auto-link-below-threshold', 'end')
  try {
    const target = await seedLinkable(value, 1)
    value.linked.probability = 0.8
    const before = await eventRow(value, target.eventId)
    const post = await judgeIn(value.env, ENDED_POST)
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null, reasons: ['event_ended'] })
    expect(candidate.discovery?.linkedEvent).toEqual({
      eventId: target.eventId,
      title: '限定名刺配布テスト',
      probability: 0.8
    })
    expect(await eventRow(value, target.eventId)).toEqual(before)
    expect(await socialJobs(value.env)).toHaveLength(0)
    // 保留は従来どおり Discord に通知する。
    expect(value.delivery).toHaveBeenCalledTimes(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('提案が 0.9 ちょうどなら連携する（境界）。0.8999 は連携しない', async () => {
  const value = await setupAuto('auto-link-boundary', 'end')
  try {
    const first = await seedLinkable(value, 1)
    value.linked.probability = 0.9
    const exact = await candidateOf(value, (await judgeIn(value.env, ENDED_POST)).id)
    expect(exact).toMatchObject({ status: 'registered', eventId: first.eventId, reasons: ['auto_linked'] })
    // 連携した 1 件目は終了したので、2 件目の判定には別の継続中のイベントを用意する。
    const second = await seedLinkable(value, 2)
    value.linked.probability = 0.8999
    const below = await candidateOf(value, (await judgeIn(value.env, '2112378276735760003')).id)
    expect(below).toMatchObject({ status: 'held', eventId: null })
    expect(below.discovery?.linkedEvent).toMatchObject({ eventId: second.eventId, probability: 0.8999 })
  } finally {
    await value.cleanup()
  }
}, 60000)

test('提案が無い（該当なし・連携先のイベントが無い）なら保留のまま', async () => {
  const value = await setupAuto('auto-link-no-proposal', 'end')
  try {
    await seedEvent(value.env, 1, 'akiba')
    value.linked.pick = 'none'
    value.linked.probability = 0.99
    const none = await candidateOf(value, (await judge(value, ENDED_POST)).id)
    expect(none).toMatchObject({ status: 'held', eventId: null })
    expect(none.discovery?.linkedEvent).toBeUndefined()
    const empty = await candidateOf(value, (await judgeIn(value.env, '2112378276735760004', { stores: ['abeno'] })).id)
    expect(empty).toMatchObject({ status: 'held', eventId: null })
    expect(value.delivery).toHaveBeenCalledTimes(2)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('登録（create）の投稿は影響を受けない。自動登録のまま、連携も提案もしない', async () => {
  const value = await setupAuto('auto-link-create', 'start')
  try {
    await seedEvent(value.env, 1, 'akiba')
    const candidate = await candidateOf(value, (await judge(value, ENDED_POST)).id)
    expect(candidate.discovery?.action).toBe('create')
    expect(candidate.status).toBe('registered')
    expect(candidate.reasons).not.toContain('auto_linked')
    expect(candidate.discovery?.linkedEvent).toBeUndefined()
    expect(candidate.eventId).not.toBe(eventId(1))
    expect(value.calls).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)
