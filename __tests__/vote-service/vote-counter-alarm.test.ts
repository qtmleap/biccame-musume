import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, mock, setSystemTime, test } from 'bun:test'
import type { Bindings } from '../../workers/app/src/types/bindings'

// Only the platform base class/storage boundary is replaced; claims execute real SQLite.
mock.module('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      protected ctx: DurableObjectState,
      protected env: Bindings
    ) {}
  }
}))
const { VoteCounterDO } = await import('../../workers/app/src/durable-objects/vote-counter')

class LocalStorage {
  db = new Database(':memory:')
  values = new Map<string, unknown>()
  alarms: number[] = []
  scheduled: number | null = null
  failSnapshot = false
  pruneCalls = 0
  sql = {
    exec: (query: string, ...bindings: string[]) => {
      if (query.startsWith('DELETE FROM daily_voted WHERE date_key <')) this.pruneCalls += 1
      const result = this.db.query(query).run(...bindings)
      return { rowsWritten: result.changes }
    }
  }
  write(key: string, value: unknown) {
    if (key === 'snapshot' && this.failSnapshot) throw new Error('storage unavailable')
    this.values.set(key, structuredClone(value))
  }
  async get(key: string): Promise<unknown> {
    return this.values.get(key)
  }
  async put(key: string, value: unknown) {
    this.write(key, value)
  }
  async getAlarm() {
    return this.scheduled
  }
  async setAlarm(time: number) {
    this.alarms.push(time)
    this.scheduled = time
  }
  claims(): Array<{ date_key: string }> {
    return this.db.query<{ date_key: string }, []>('SELECT date_key FROM daily_voted ORDER BY date_key').all()
  }
}

const stores: LocalStorage[] = []
const makeStorage = () => {
  const storage = new LocalStorage()
  stores.push(storage)
  return storage
}
const start = async (storage: LocalStorage) => {
  const ready: Promise<unknown>[] = []
  const ctx = {
    storage,
    blockConcurrencyWhile: (callback: () => Promise<unknown>) => {
      const promise = callback()
      ready.push(promise)
      return promise
    }
  } as unknown as DurableObjectState
  const counter = new VoteCounterDO(ctx, {} as Bindings)
  await Promise.all(ready)
  return counter
}
const claim = (counter: InstanceType<typeof VoteCounterDO>, characterIds = ['sapporo'], dateKey = '2026-10-02') =>
  counter.claimVotes({ characterIds, dateKey, ip: '203.0.113.1', bypassLimit: false })
const fire = async (storage: LocalStorage, counter: InstanceType<typeof VoteCounterDO>) => {
  // Cloudflare consumes the scheduled alarm before invoking the handler.
  storage.scheduled = null
  await counter.alarm()
}

beforeEach(() => setSystemTime(Date.parse('2026-10-01T15:01:00.000Z')))
afterEach(() => {
  setSystemTime()
  for (const store of stores.splice(0)) store.db.close()
})

test('clean_alarm_is_not_rescheduled', async () => {
  const storage = makeStorage()
  storage.scheduled = 1 // obsolete alarm inherited from an older implementation/year
  const counter = await start(storage)
  await fire(storage, counter)
  expect(storage.alarms).toEqual([])
  expect(storage.scheduled).toBeNull()
  expect(storage.values.has('snapshot')).toBe(false)
})

test('initialization_and_reads_do_not_schedule', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  expect(await counter.snapshot()).toEqual({ counts: {} })
  expect(storage.alarms).toEqual([])
})

test('vote_schedules_single_flush', async () => {
  const storage = makeStorage()
  storage.scheduled = 1
  const counter = await start(storage)
  await fire(storage, counter)
  storage.alarms = []
  await claim(counter)
  await claim(counter, ['akiba'])
  await claim(counter)
  expect(storage.alarms).toHaveLength(1)
  expect(storage.scheduled).toBeGreaterThan(Date.now())
  await fire(storage, counter)
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 1, akiba: 1 } })
  expect(storage.alarms).toHaveLength(1)
  expect(storage.scheduled).toBeNull()
  await claim(counter, ['sapporo'], '2026-10-03')
  expect(storage.alarms).toHaveLength(2)
})

test('restart_restores_snapshot', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter, ['sapporo', 'akiba'])
  await fire(storage, counter)
  storage.alarms = []
  const restarted = await start(storage)
  expect(await restarted.snapshot()).toEqual({ counts: { sapporo: 1, akiba: 1 } })
  expect(await claim(restarted)).toEqual({ voted: [], skipped: ['sapporo'] })
  expect(storage.alarms).toEqual([])
})

test('new_day_prunes_old_claims', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter, ['sapporo'], '2026-09-29')
  await claim(counter, ['sapporo'], '2026-09-30')
  await claim(counter, ['sapporo'], '2026-10-01')
  await claim(counter, ['akiba'], '2026-10-02')
  expect(storage.claims()).toEqual([{ date_key: '2026-09-30' }, { date_key: '2026-10-01' }, { date_key: '2026-10-02' }])
  const prunes = storage.pruneCalls
  await claim(counter, ['sapporo'], '2026-10-02')
  expect(storage.pruneCalls).toBe(prunes)
})

test('release_changes_schedule_and_restore', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter)
  await fire(storage, counter)
  storage.alarms = []
  await counter.releaseVotes({ characterIds: ['sapporo'], dateKey: '2026-10-02', ip: '203.0.113.1' })
  expect(storage.alarms).toHaveLength(1)
  await fire(storage, counter)
  const restarted = await start(storage)
  expect(await restarted.snapshot()).toEqual({ counts: { sapporo: 0 } })
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 0 } })
  expect(await claim(restarted)).toEqual({ voted: ['sapporo'], skipped: [] })
})

test('failed_flush_retains_dirty_for_retry', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter)
  storage.failSnapshot = true
  await expect(fire(storage, counter)).rejects.toThrow('storage unavailable')
  storage.failSnapshot = false
  // Cloudflare retries an uncaught failure; keep the unflushed revision in memory.
  await fire(storage, counter)
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 1 } })
  expect(storage.scheduled).toBeNull()
})

test('mutation_during_flush_is_preserved_and_schedules_one_followup', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter)
  const originalPut = storage.put.bind(storage)
  const started = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  storage.put = async (key, value) => {
    started.resolve()
    await finish.promise
    await originalPut(key, value)
  }
  const flush = fire(storage, counter)
  await started.promise
  // Deliberate stress interleaving beyond default storage input gates.
  await Promise.all([claim(counter, ['akiba']), claim(counter, ['namba'])])
  finish.resolve()
  await flush
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 1 } })
  expect(storage.alarms).toHaveLength(2)
  storage.put = originalPut
  await fire(storage, counter)
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 1, akiba: 1, namba: 1 } })
  expect(storage.alarms).toHaveLength(2)
  expect(storage.scheduled).toBeNull()
})

test('release_during_flush_is_preserved', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter)
  const originalPut = storage.put.bind(storage)
  const started = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  storage.put = async (key, value) => {
    started.resolve()
    await finish.promise
    await originalPut(key, value)
  }
  const flush = fire(storage, counter)
  await started.promise
  await counter.releaseVotes({ characterIds: ['sapporo'], ip: '203.0.113.1', dateKey: '2026-10-02' })
  finish.resolve()
  await flush
  storage.put = originalPut
  await fire(storage, counter)
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 0 } })
  expect(storage.alarms).toHaveLength(2)
  expect(storage.scheduled).toBeNull()
})

test('obsolete_alarm_does_not_replace_an_already_pending_flush', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter)
  await fire(storage, counter)
  await claim(counter, ['akiba'])
  const pending = storage.scheduled
  // At-least-once delivery may repeat an earlier handler while a later alarm exists.
  await counter.alarm()
  await claim(counter, ['namba'])
  expect(storage.alarms).toHaveLength(2)
  expect(storage.scheduled).toBe(pending)
  await fire(storage, counter)
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 1, akiba: 1, namba: 1 } })
  expect(storage.scheduled).toBeNull()
})

test('failed_schedule_is_retried_without_incrementing_a_duplicate_claim', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  const setAlarm = storage.setAlarm.bind(storage)
  storage.setAlarm = async () => {
    throw new Error('alarm unavailable')
  }
  await expect(claim(counter)).rejects.toThrow('alarm unavailable')
  storage.setAlarm = setAlarm
  expect(await claim(counter)).toEqual({ voted: [], skipped: ['sapporo'] })
  expect(storage.alarms).toHaveLength(1)
  await fire(storage, counter)
  expect(storage.values.get('snapshot')).toEqual({ counts: { sapporo: 1 } })
  expect(storage.scheduled).toBeNull()
})

test('empty_claim_and_release_without_count_change_do_not_schedule', async () => {
  const storage = makeStorage()
  const counter = await start(storage)
  await claim(counter, [])
  await counter.releaseVotes({ characterIds: ['missing'], ip: '203.0.113.1', dateKey: '2026-10-02' })
  expect(storage.alarms).toEqual([])
  expect(await counter.snapshot()).toEqual({ counts: {} })
})
