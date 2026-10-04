import { DurableObject } from 'cloudflare:workers'
import dayjs from 'dayjs'
import type { Bindings } from '@/types/bindings'

// alarm() で snapshot を永続化するインターバル。
// in-memory increment は O(1)、変更があるときだけ保存を予約する。
const ALARM_INTERVAL_MS = 5_000

// daily_voted を保持する日数。当日の判定には前日ぶんがあれば足りる。
const VOTED_RETENTION_DAYS = 2

type Snapshot = {
  counts: Record<string, number>
}

export type VoteCountsSnapshot = {
  counts: Record<string, number>
}

export type ClaimVotesInput = {
  characterIds: string[]
  ip: string
  /** JST 基準の YYYY-MM-DD */
  dateKey: string
  /** ローカル開発では 1 日 1 回制限を迂回する */
  bypassLimit: boolean
}

export type ClaimVotesResult = {
  voted: string[]
  skipped: string[]
}

/**
 * VoteCounterDO — 年スコープごとの投票カウンタと 1 日 1 回制限を束ねる DO。
 *
 * 設計: `idFromName(<year>)` で年ごとに 1 インスタンス。
 * 投票済み判定は daily_voted テーブルの `INSERT OR IGNORE` で行う。
 * SQL exec は同期のため DO 内に await 境界が生まれず、 DO が単一スレッドである
 * 以上「判定 → カウンタ +1」は原子的になる (KV 実装にあった TOCTOU の解消)。
 * カウンタは in-memory に持ち、変更後 {@link ALARM_INTERVAL_MS} の alarm() で
 * storage へバッチ永続化する。変更が無いときは alarm を予約しない。 D1 voteCount からの dual-write 移行中は
 * read 側は D1 のままで、本 DO のカウンタは書き込み観察用 (Phase A)。
 */
export class VoteCounterDO extends DurableObject<Bindings> {
  private counts = new Map<string, number>()
  private dirty = false
  private revision = 0
  private schedulingFlush?: Promise<void>
  private lastPrunedDateKey = ''

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS daily_voted (
          date_key TEXT NOT NULL,
          ip TEXT NOT NULL,
          character_id TEXT NOT NULL,
          PRIMARY KEY (date_key, ip, character_id)
        ) WITHOUT ROWID`
      )
      const stored = await ctx.storage.get<Snapshot>('snapshot')
      if (stored) {
        this.counts = new Map(Object.entries(stored.counts))
      }
    })
  }

  /**
   * 未投票の characterId を確保しつつカウンタを +1 する。
   * 既に同じ (dateKey, ip, characterId) が存在すれば skipped として返す。
   */
  async claimVotes(input: ClaimVotesInput): Promise<ClaimVotesResult> {
    const voted: string[] = []
    const skipped: string[] = []
    this.pruneOldVoted(input.dateKey)

    for (const characterId of input.characterIds) {
      const cursor = this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO daily_voted (date_key, ip, character_id) VALUES (?, ?, ?)',
        input.dateKey,
        input.ip,
        characterId
      )
      if (cursor.rowsWritten === 1 || input.bypassLimit) {
        voted.push(characterId)
      } else {
        skipped.push(characterId)
      }
    }

    for (const characterId of voted) {
      const current = this.counts.get(characterId)
      this.counts.set(characterId, current === undefined ? 1 : current + 1)
    }
    if (voted.length > 0) {
      this.dirty = true
      this.revision += 1
    }
    if (this.dirty) await this.scheduleFlush()

    return { voted, skipped }
  }

  /**
   * D1 への永続化が失敗したときの補償。確保を取り消してその日の再投票を許す。
   */
  async releaseVotes(input: { characterIds: string[]; ip: string; dateKey: string }): Promise<void> {
    const changed: string[] = []
    for (const characterId of input.characterIds) {
      this.ctx.storage.sql.exec(
        'DELETE FROM daily_voted WHERE date_key = ? AND ip = ? AND character_id = ?',
        input.dateKey,
        input.ip,
        characterId
      )
      const current = this.counts.get(characterId)
      if (current !== undefined && current > 0) {
        this.counts.set(characterId, current - 1)
        changed.push(characterId)
      }
    }
    if (changed.length > 0) {
      this.dirty = true
      this.revision += 1
    }
    if (this.dirty) await this.scheduleFlush()
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
    if (!this.dirty) return
    const revision = this.revision
    const payload: Snapshot = {
      counts: Object.fromEntries(this.counts)
    }
    // 失敗は throw し、Cloudflare の alarm retry に任せる。dirty は残す。
    await this.ctx.storage.put('snapshot', payload)
    this.dirty = this.revision !== revision
    if (this.dirty) await this.scheduleFlush()
  }

  private scheduleFlush(): Promise<void> {
    // 同時に来た変更は同じ予約を待ち、既存の alarm の時刻を延長しない。
    if (this.schedulingFlush) return this.schedulingFlush
    this.schedulingFlush = (async () => {
      const existingAlarm = await this.ctx.storage.getAlarm()
      if (existingAlarm === null) {
        await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
      }
    })().finally(() => {
      this.schedulingFlush = undefined
    })
    return this.schedulingFlush
  }

  /**
   * JST の claim 日付が進んだ最初の要求で古い行を捨てる。
   * 処理中の日付変更や遅れて来た要求でも、確保時の日付を使う。
   */
  private pruneOldVoted(dateKey: string): void {
    if (dateKey <= this.lastPrunedDateKey) return
    const threshold = dayjs(dateKey).subtract(VOTED_RETENTION_DAYS, 'day').format('YYYY-MM-DD')
    this.ctx.storage.sql.exec('DELETE FROM daily_voted WHERE date_key < ?', threshold)
    this.lastPrunedDateKey = dateKey
  }
}
