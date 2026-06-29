import { DurableObject } from 'cloudflare:workers'
import type { Bindings } from '@/types/bindings'

// alarm() で snapshot を永続化するインターバル。
// in-memory increment は O(1) で即返却、 永続化はバッチに寄せる。
const ALARM_INTERVAL_MS = 5_000

type Snapshot = {
  counts: Record<string, number>
}

export type VoteCountsSnapshot = {
  counts: Record<string, number>
}

/**
 * VoteCounterDO — 年スコープごとの投票カウンタを in-memory に集計する DO。
 *
 * 設計: `idFromName(<year>)` で年ごとに 1 インスタンス。
 * `recordVotes` RPC で in-memory counter を atomically に +1 し、
 * alarm() で {@link ALARM_INTERVAL_MS} ごとに storage へバッチ永続化する。
 * D1 voteCount テーブルからの dual-write 移行中は read 側は D1 のままで、
 * 本 DO は書き込み観察用 (Phase A)。 Phase B で値突合、 Phase C で
 * `getAllVoteCounts` の read を本 DO 経由に切替予定。
 */
export class VoteCounterDO extends DurableObject<Bindings> {
  private counts = new Map<string, number>()
  private dirty = false

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<Snapshot>('snapshot')
      if (stored) {
        this.counts = new Map(Object.entries(stored.counts))
      }
      const existingAlarm = await ctx.storage.getAlarm()
      if (existingAlarm === null) {
        await ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
      }
    })
  }

  /**
   * voted 判定された characterId 群を in-memory カウンタに +1 する。
   * 既に voted な characterId は呼び出し側でフィルタ済みである前提
   * (重複チェックは Phase A 時点では D1 側の rate-limiter / vote-limiter で行う)。
   */
  async recordVotes(input: { characterIds: string[] }): Promise<void> {
    if (input.characterIds.length === 0) return
    for (const cid of input.characterIds) {
      this.counts.set(cid, (this.counts.get(cid) ?? 0) + 1)
    }
    this.dirty = true
  }

  /**
   * 観察用に現在のカウンタスナップショットを返す。
   * Phase B で D1 値との突合に使う想定。
   */
  async snapshot(): Promise<VoteCountsSnapshot> {
    return {
      counts: Object.fromEntries(this.counts)
    }
  }

  override async alarm(): Promise<void> {
    if (this.dirty) {
      const payload: Snapshot = {
        counts: Object.fromEntries(this.counts)
      }
      await this.ctx.storage.put('snapshot', payload)
      this.dirty = false
    }
    await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
  }
}
