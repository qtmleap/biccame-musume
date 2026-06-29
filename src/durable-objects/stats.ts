import { DurableObject } from 'cloudflare:workers'
import type { Bindings } from '@/types/bindings'

// alarm() で snapshot を永続化するインターバル。
// in-memory increment は O(1) で即返却、永続化はバッチに寄せる。
const ALARM_INTERVAL_MS = 5_000

// 過去 N 日分の daily / dailyUsers のみ保持し、それより古いキーは alarm() でパージする。
const DAILY_RETENTION_DAYS = 7

type Snapshot = {
  total: number
  daily: Record<string, number>
  paths: Record<string, number>
  dailyUsers: Record<string, string[]>
}

export type StatsSnapshot = {
  total: number
  today: number
  paths: Record<string, number>
  todayUserCount: number
}

/**
 * StatsDO — ページビュー / 本日のユニークユーザー数を atomically に集計する DO。
 *
 * 設計: `idFromName('global')` で単一インスタンスを使う。in-memory state を
 * RPC で更新し、alarm() で {@link ALARM_INTERVAL_MS} 毎に storage へバッチ永続化する。
 * KV からの dual-write 移行中は read 側は KV のままで、本 DO は書き込み観察用。
 */
export class StatsDO extends DurableObject<Bindings> {
  private total = 0
  private daily = new Map<string, number>()
  private paths = new Map<string, number>()
  private dailyUsers = new Map<string, Set<string>>()
  private dirty = false

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const snapshot = await ctx.storage.get<Snapshot>('snapshot')
      if (snapshot) {
        this.restore(snapshot)
      }
      const existingAlarm = await ctx.storage.getAlarm()
      if (existingAlarm === null) {
        await ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
      }
    })
  }

  async increment(input: { path: string; dateKey: string; userKey?: string }): Promise<void> {
    const { path, dateKey, userKey } = input
    this.total += 1
    this.daily.set(dateKey, (this.daily.get(dateKey) ?? 0) + 1)
    this.paths.set(path, (this.paths.get(path) ?? 0) + 1)
    if (userKey !== undefined) {
      const todaySet = this.dailyUsers.get(dateKey) ?? new Set<string>()
      todaySet.add(userKey)
      this.dailyUsers.set(dateKey, todaySet)
    }
    this.dirty = true
  }

  async snapshot(input: { dateKey: string }): Promise<StatsSnapshot> {
    return {
      total: this.total,
      today: this.daily.get(input.dateKey) ?? 0,
      paths: Object.fromEntries(this.paths),
      todayUserCount: this.dailyUsers.get(input.dateKey)?.size ?? 0
    }
  }

  override async alarm(): Promise<void> {
    if (this.dirty) {
      this.pruneOldDaily()
      await this.ctx.storage.put('snapshot', this.dump())
      this.dirty = false
    }
    await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
  }

  private pruneOldDaily(): void {
    const sortedDates = [...this.daily.keys()].sort()
    const dropCount = Math.max(0, sortedDates.length - DAILY_RETENTION_DAYS)
    for (const dateKey of sortedDates.slice(0, dropCount)) {
      this.daily.delete(dateKey)
      this.dailyUsers.delete(dateKey)
    }
  }

  private restore(snapshot: Snapshot): void {
    this.total = snapshot.total
    this.daily = new Map(Object.entries(snapshot.daily))
    this.paths = new Map(Object.entries(snapshot.paths))
    this.dailyUsers = new Map(Object.entries(snapshot.dailyUsers).map(([k, arr]) => [k, new Set(arr)]))
  }

  private dump(): Snapshot {
    return {
      total: this.total,
      daily: Object.fromEntries(this.daily),
      paths: Object.fromEntries(this.paths),
      dailyUsers: Object.fromEntries([...this.dailyUsers.entries()].map(([k, v]) => [k, [...v]]))
    }
  }
}
