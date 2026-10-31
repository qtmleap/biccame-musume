import { expect, test } from 'bun:test'
import { rejudgeWebhookJob } from '@api/services/webhook-admin'
import { EVENT_DETECTION_THRESHOLDS_KEY } from '@api/services/webhook-config'
import { getWebhookJob } from '@api/services/webhook-jobs'
import { processWebhookJob } from '@api/services/webhook-process'
import {
  candidateRow,
  ENDED_AT,
  eventRow,
  judgeIn,
  rewindToStoredResult,
  seedLinkable,
  setupAuto
} from './fixtures/webhook-auto-link'
import { references, socialJobs } from './fixtures/webhook-link-ended'
import { candidateOf, ENDED } from './fixtures/webhook-linked-event'

// 自動連携の経路: 保存済みの結果を使う再試行、同じイベントへの 2 回目の終了、複数候補の投稿、しきい値の設定、連携後の再判定。

const FIRST = '2112378276735760021'
const SECOND = '2112378276735760022'

test('保存済みの判定結果を使う再試行（途中で落ちた処理のやり直し）でも自動連携する。Clef は呼び直さない', async () => {
  const value = await setupAuto('auto-link-retry', 'end')
  try {
    const target = await seedLinkable(value, 1)
    // 提案が 0.8 の間は保留。保存済みの結果は、提案を含めて残る。
    value.linked.probability = 0.8
    const post = await judgeIn(value.env, FIRST)
    expect((await candidateOf(value, post.id)).status).toBe('held')
    expect(value.calls).toHaveLength(1)
    // 登録の前で落ちた状態に戻し、保存済みの提案の確率だけを 0.95 にして、そのまま処理し直す。
    await rewindToStoredResult(value, post.id, 0.95)
    await processWebhookJob(value.env, post.id)
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({
      status: 'registered',
      eventId: target.eventId,
      reasons: ['auto_linked'],
      notificationStatus: 'skipped'
    })
    expect(value.calls).toHaveLength(1)
    expect((await eventRow(value, target.eventId))?.ended_at).toBe(ENDED_AT)
    expect(await socialJobs(value.env)).toHaveLength(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('同じイベントへ 2 回目の終了投稿を連携しても、連携はするが更新投稿を重ねず、ended_at も上書きしない', async () => {
  const value = await setupAuto('auto-link-second-end', 'end')
  try {
    const target = await seedLinkable(value, 1)
    // 2 件の終了投稿を、どちらもイベントが未終了の間に判定する。先の 1 件は 0.8 で保留、後の 1 件が 0.95 で先に連携して終了する。
    value.linked.probability = 0.8
    const held = await judgeIn(value.env, FIRST)
    value.linked.probability = 0.95
    const linked = await judgeIn(value.env, SECOND, { text: `${ENDED}（再掲）` })
    expect((await candidateOf(value, linked.id)).eventId).toBe(target.eventId)
    const afterFirst = await eventRow(value, target.eventId)
    const jobsAfterFirst = await socialJobs(value.env)
    expect(afterFirst?.ended_at).toBe(ENDED_AT)
    expect(jobsAfterFirst).toHaveLength(1)
    // 保留だった方を、保存済みの提案（同じイベント）のまま連携の対象にする。
    await rewindToStoredResult(value, held.id, 0.95)
    await processWebhookJob(value.env, held.id)
    expect(await candidateOf(value, held.id)).toMatchObject({
      status: 'registered',
      eventId: target.eventId,
      reasons: ['auto_linked']
    })
    expect(await socialJobs(value.env)).toEqual(jobsAfterFirst)
    expect(await eventRow(value, target.eventId)).toEqual(afterFirst)
    expect((await references(value.env, target.eventId)).filter((row) => row.type === 'end')).toEqual(
      [held.url, linked.url].toSorted().map((url) => ({ type: 'end', url }))
    )
  } finally {
    await value.cleanup()
  }
}, 60000)

test('複数候補の投稿は、候補ごとに自動連携される・されないが分かれ、親ジョブの集約が壊れない', async () => {
  const value = await setupAuto('auto-link-candidates', 'end')
  try {
    // 秋葉原店には継続中のイベントがあり、あべの店には無い。1 件の抽出イベントが店舗ごとの 2 候補になる。
    const target = await seedLinkable(value, 1)
    const post = await judgeIn(value.env, FIRST, {
      stores: ['akiba', 'abeno'],
      text: '秋葉原店・あべの店の限定名刺の配布は本日で終了しました。'
    })
    const job = await getWebhookJob(value.env, post.id)
    expect(job.candidates.map((candidate) => [candidate.storeKey, candidate.status])).toEqual([
      ['akiba', 'registered'],
      ['abeno', 'held']
    ])
    const [linked, held] = job.candidates
    expect(linked).toMatchObject({ eventId: target.eventId, reasons: ['auto_linked'], notificationStatus: 'skipped' })
    expect(held).toMatchObject({ eventId: null, notificationStatus: 'sent' })
    expect(held.discovery?.linkedEvent).toBeUndefined()
    // 親: 保留が残るので held。連携した候補の理由と保留の候補の理由が集約され、通知は保留の候補の 1 件だけ。
    expect(job.status).toBe('held')
    expect(job.reasons).toEqual(expect.arrayContaining(['auto_linked', 'event_ended']))
    expect(job.lastError).toBeNull()
    expect(value.delivery).toHaveBeenCalledTimes(1)
    expect(await socialJobs(value.env)).toHaveLength(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('自動連携の確率は共通のしきい値（選択肢項目の choiceThreshold）に従う。0.97 に上げた設定では 0.95 の提案は連携しない', async () => {
  const value = await setupAuto('auto-link-configured-threshold', 'end')
  try {
    await seedLinkable(value, 1)
    await value.env.BICCAME_MUSUME_EVENTS.put(
      EVENT_DETECTION_THRESHOLDS_KEY,
      JSON.stringify({ eventThreshold: 0.9, ignoreThreshold: 0.5, choiceThreshold: 0.97 })
    )
    const post = await judgeIn(value.env, FIRST)
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null })
    expect(candidate.discovery?.linkedEvent?.probability).toBe(0.95)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('自動連携したジョブの再判定は、手動連携と同じ経路で連携を外し（event_id を NULL）、queued に戻す。連携先の終了は戻さない', async () => {
  const value = await setupAuto('auto-link-rejudge', 'end')
  try {
    const target = await seedLinkable(value, 1)
    const post = await judgeIn(value.env, FIRST)
    const linked = await candidateOf(value, post.id)
    expect(linked.status).toBe('registered')
    const afterLink = await eventRow(value, target.eventId)
    const rejudged = await rejudgeWebhookJob(value.env, post.id, linked.eventUUID)
    expect(rejudged.status).toBe('queued')
    expect(await candidateRow(value, post.id)).toMatchObject({
      status: 'queued',
      event_id: null,
      reasons_json: '[]',
      notification_status: 'pending',
      result_json: null
    })
    // 連携先のイベント（ended_at・参照URL・予約済みの更新投稿）は戻らない。人が手で直す。
    expect(await eventRow(value, target.eventId)).toEqual(afterLink)
    expect(await socialJobs(value.env)).toHaveLength(1)
  } finally {
    await value.cleanup()
  }
}, 60000)
