import { expect, test } from 'bun:test'
import { processWebhookJob } from '@api/services/webhook-process'
import {
  afterEventRead,
  candidateRow,
  eventRow,
  judgeIn,
  rewindToStoredResult,
  seedLinkable,
  setupAuto
} from './fixtures/webhook-auto-link'
import { references, socialJobs } from './fixtures/webhook-link-ended'
import { CONTINUING, candidateOf } from './fixtures/webhook-linked-event'

// 自動連携の書き込みが競合・ガード不成立のとき（連携先が読み取りの後に変わった、行の状態が変わった、連携先が無い）は、
// 判定全体を失敗にせず、通常どおり保留にして人に回す（警告だけを残す）。D1 の予期しない例外は握りつぶさず、候補を失敗にする。

const POST = '2112378276735760031'

const warnedAutoLink = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.filter((call) => call[0] === '[webhook-auto-link]')

test('連携先が読み取りの後に更新された（版の不一致）なら、何も反映せず保留に落ち、候補は失敗にならない', async () => {
  const value = await setupAuto('auto-link-conflict-cas', 'end')
  try {
    const target = await seedLinkable(value, 1)
    const hook = afterEventRead(value, async () => {
      await value.env.DB.prepare("UPDATE events SET updated_at='2026-10-30T00:00:00.000+00:00' WHERE id=?")
        .bind(target.eventId)
        .run()
    })
    const post = await judgeIn(value.env, POST)
    hook.restore()
    expect(hook.state.fired).toBe(true)
    const candidate = await candidateOf(value, post.id)
    expect(candidate).toMatchObject({ status: 'held', eventId: null, lastError: null, notificationStatus: 'sent' })
    expect(candidate.discovery?.linkedEvent?.eventId).toBe(target.eventId)
    // batch 全体が空振り: 終了も参照URLも更新投稿も反映されない（割り込んだ更新だけが残る）。
    expect((await eventRow(value, target.eventId))?.ended_at).toBeNull()
    expect((await eventRow(value, target.eventId))?.updated_at).toBe('2026-10-30T00:00:00.000+00:00')
    expect(await references(value.env, target.eventId)).toEqual([{ type: 'announce', url: target.announceUrl }])
    expect(await socialJobs(value.env)).toHaveLength(0)
    expect(warnedAutoLink(value.warn)).toHaveLength(1)
    expect(String(warnedAutoLink(value.warn)[0][1])).toContain('could not be applied')
    // 保留は従来どおり Discord に通知する。
    expect(value.delivery).toHaveBeenCalledTimes(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('行の状態が読み取りの後に変わった（更新前の状態のガード不成立）なら、何も反映せず保留に落ちる', async () => {
  const value = await setupAuto('auto-link-conflict-guard', 'end')
  try {
    const target = await seedLinkable(value, 1)
    const hook = afterEventRead(value, async () => {
      await value.env.DB.prepare("UPDATE webhook_event_candidates SET status='ignored' WHERE post_id=?")
        .bind(POST)
        .run()
    })
    const post = await judgeIn(value.env, POST)
    hook.restore()
    expect(hook.state.fired).toBe(true)
    expect(await candidateRow(value, post.id)).toMatchObject({
      status: 'held',
      event_id: null,
      last_error: null
    })
    expect((await eventRow(value, target.eventId))?.ended_at).toBeNull()
    expect(await references(value.env, target.eventId)).toEqual([{ type: 'announce', url: target.announceUrl }])
    expect(await socialJobs(value.env)).toHaveLength(0)
    expect(warnedAutoLink(value.warn)).toHaveLength(1)
  } finally {
    await value.cleanup()
  }
}, 60000)

test('連携先が読み取りの後に削除された（404）なら、保留に落ちる', async () => {
  const value = await setupAuto('auto-link-conflict-deleted', 'end')
  try {
    const target = await seedLinkable(value, 1)
    const hook = afterEventRead(value, async () => {
      await value.env.DB.prepare('DELETE FROM events WHERE id=?').bind(target.eventId).run()
    })
    const post = await judgeIn(value.env, POST)
    hook.restore()
    expect(hook.state.fired).toBe(true)
    expect(await candidateRow(value, post.id)).toMatchObject({ status: 'held', event_id: null, last_error: null })
    expect(warnedAutoLink(value.warn)).toHaveLength(1)
    expect(await socialJobs(value.env)).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)

test.each([
  ['終了', 'end', undefined],
  ['継続', 'ongoing', CONTINUING]
] as const)(
  '保存済みの提案の連携先が処理の前に消えていた（%s）なら、書き込みに進まず保留に落ち、外部キー違反を起こさない',
  async (_name, status, text) => {
    const value = await setupAuto(`auto-link-missing-${status}`, status)
    try {
      const target = await seedLinkable(value, 1)
      value.linked.probability = 0.8
      const post = await judgeIn(value.env, POST, text === undefined ? {} : { text })
      await rewindToStoredResult(value, post.id, 0.95)
      await value.env.DB.prepare('DELETE FROM events WHERE id=?').bind(target.eventId).run()
      await processWebhookJob(value.env, post.id)
      expect(await candidateRow(value, post.id)).toMatchObject({ status: 'held', event_id: null, last_error: null })
      expect(warnedAutoLink(value.warn)).toHaveLength(1)
      expect(String(warnedAutoLink(value.warn)[0][1])).toContain('no longer exists')
    } finally {
      await value.cleanup()
    }
  },
  60000
)

test('D1 の予期しない例外は握りつぶさず、候補を registration 段階の失敗にする（保留に落とさない）', async () => {
  const value = await setupAuto('auto-link-unexpected', 'end')
  try {
    const target = await seedLinkable(value, 1)
    const hook = afterEventRead(value, async () => {
      throw new Error('Synthetic D1 failure')
    })
    await expect(judgeIn(value.env, POST)).rejects.toThrow('Synthetic D1 failure')
    hook.restore()
    expect(hook.state.fired).toBe(true)
    expect(await candidateRow(value, POST)).toMatchObject({
      status: 'failed',
      event_id: null,
      last_error: 'processing_failed:registration:Error'
    })
    expect((await eventRow(value, target.eventId))?.ended_at).toBeNull()
    expect(warnedAutoLink(value.warn)).toHaveLength(0)
  } finally {
    await value.cleanup()
  }
}, 60000)
