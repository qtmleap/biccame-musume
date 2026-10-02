/**
 * vote-service の DO 連携テスト。
 *
 * `@/lib/prisma` を mock.module で差し替え、VoteCounterDO の stub を env 経由で
 * 注入して、重複判定・fail-open・D1 失敗時の補償を確認する。
 *
 * NOTE: bun:test の mock.module はテストファイル全体にグローバル適用されるため、
 *       本ファイルは vote-service に特化させる。
 */

import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test'
import type { Bindings } from '../../src/types/bindings'

const state = {
  transactionCalls: 0,
  failTransaction: false,
  releasedIds: [] as string[],
  claimedIds: [] as string[],
  readYear: 0,
  writeYear: 0
}

const prismaMock = {
  $transaction: async (ops: unknown[]) => {
    state.transactionCalls += 1
    if (state.failTransaction) throw new Error('D1 unavailable')
    return ops
  },
  voteCount: {
    findMany: async (args: { where: { year: number } }) => {
      state.readYear = args.where.year
      return [{ characterId: 'sapporo', count: 1 }]
    },
    upsert: (args: { create: { year: number } }) => {
      state.writeYear = args.create.year
      return args
    }
  },
  vote: { create: (args: unknown) => args, createMany: (args: unknown) => args }
}

mock.module('@/lib/prisma', () => ({
  getPrisma: () => prismaMock
}))

// mock を仕掛けた後に動的 import (静的 import だと mock 適用前に解決される)
const { vote, bulkVote, getAllVoteCounts } = await import('../../src/services/vote-service')

type Stub = {
  claimVotes: (input: { characterIds: string[] }) => Promise<{ voted: string[]; skipped: string[] }>
  releaseVotes: (input: { characterIds: string[] }) => Promise<void>
}

const buildEnv = (stub: Stub): Bindings =>
  ({
    ENVIRONMENT: 'production',
    ASSETS: {
      fetch: async () =>
        Response.json(['sapporo', 'akiba'].map((id) => ({ id, character: { is_biccame_musume: true } })))
    },
    VOTE_COUNTER: {
      idFromName: (name: string) => name,
      get: () => stub
    }
  }) as unknown as Bindings

/** 渡された characterIds のうち alreadyVoted に含まれるものを skipped にする stub */
const buildStub = (alreadyVoted: string[]): Stub => ({
  claimVotes: async (input) => {
    state.claimedIds = input.characterIds
    return {
      voted: input.characterIds.filter((id) => !alreadyVoted.includes(id)),
      skipped: input.characterIds.filter((id) => alreadyVoted.includes(id))
    }
  },
  releaseVotes: async (input) => {
    state.releasedIds = input.characterIds
  }
})

afterEach(() => setSystemTime())

beforeEach(() => {
  state.transactionCalls = 0
  state.failTransaction = false
  state.releasedIds = []
  state.claimedIds = []
})

describe('vote', () => {
  test('未投票なら voted を返し D1 に書き込む', async () => {
    const result = await vote(buildEnv(buildStub([])), 'sapporo', '203.0.113.1')
    expect(result.status).toBe('voted')
    expect(state.transactionCalls).toBe(1)
  })

  test('投票済みなら skipped を返し D1 に触れない', async () => {
    const result = await vote(buildEnv(buildStub(['sapporo'])), 'sapporo', '203.0.113.1')
    expect(result.status).toBe('skipped')
    expect(state.transactionCalls).toBe(0)
  })

  test('D1 が失敗したら確保を取り消して再 throw する', async () => {
    state.failTransaction = true
    const promise = vote(buildEnv(buildStub([])), 'sapporo', '203.0.113.1')
    expect(promise).rejects.toThrow('D1 unavailable')
    await promise.catch(() => undefined)
    expect(state.releasedIds).toEqual(['sapporo'])
  })

  test('DO が落ちていても投票を通す (fail-open)', async () => {
    const brokenStub: Stub = {
      claimVotes: async () => {
        throw new Error('DO unavailable')
      },
      releaseVotes: async () => undefined
    }
    const result = await vote(buildEnv(brokenStub), 'sapporo', '203.0.113.1')
    expect(result.status).toBe('voted')
    expect(state.transactionCalls).toBe(1)
  })
})

describe('bulkVote', () => {
  test('投票済みのぶんだけ skipped にして残りを通す', async () => {
    const results = await bulkVote(buildEnv(buildStub(['sapporo'])), ['sapporo', 'akiba'], '203.0.113.1')
    expect(results).toEqual([
      { characterId: 'sapporo', status: 'skipped' },
      { characterId: 'akiba', status: 'voted' }
    ])
    expect(state.transactionCalls).toBe(1)
  })

  test('全件投票済みなら D1 に触れない', async () => {
    const results = await bulkVote(buildEnv(buildStub(['sapporo', 'akiba'])), ['sapporo', 'akiba'], '203.0.113.1')
    expect(results.every((r) => r.status === 'skipped')).toBe(true)
    expect(state.transactionCalls).toBe(0)
  })

  test('重複した characterId は 1 回だけ DO に渡す', async () => {
    await bulkVote(buildEnv(buildStub([])), ['sapporo', 'sapporo', 'akiba'], '203.0.113.1')
    expect(state.claimedIds).toEqual(['sapporo', 'akiba'])
  })

  test('空配列なら DO も D1 も呼ばない', async () => {
    const results = await bulkVote(buildEnv(buildStub([])), [], '203.0.113.1')
    expect(results).toEqual([])
    expect(state.claimedIds).toEqual([])
    expect(state.transactionCalls).toBe(0)
  })

  test('D1 が失敗したら確保した分を取り消す', async () => {
    state.failTransaction = true
    const promise = bulkVote(buildEnv(buildStub([])), ['sapporo', 'akiba'], '203.0.113.1')
    expect(promise).rejects.toThrow('D1 unavailable')
    await promise.catch(() => undefined)
    expect(state.releasedIds).toEqual(['sapporo', 'akiba'])
  })
})

for (const kind of ['single', 'bulk'] as const) {
  const submit = (env: Bindings) =>
    kind === 'single' ? vote(env, 'sapporo', '203.0.113.1') : bulkVote(env, ['sapporo', 'akiba'], '203.0.113.1')

  test(`new_year_read_and_write_same_year (${kind})`, async () => {
    setSystemTime(new Date('2026-12-31T15:00:00.000Z'))
    const env = buildEnv(buildStub([]))
    expect(await getAllVoteCounts(env)).toEqual([{ key: 'sapporo', count: 1 }])
    await submit(env)
    expect(state.readYear).toBe(2027)
    expect(state.writeYear).toBe(2027)
  })

  test(`release_uses_original_context (${kind})`, async () => {
    setSystemTime(new Date('2026-12-31T14:59:59.999Z'))
    const claims: unknown[] = []
    const releases: unknown[] = []
    const names: string[] = []
    const env = buildEnv({
      claimVotes: async (input) => {
        claims.push(input)
        setSystemTime(new Date('2026-12-31T15:00:00.000Z'))
        return { voted: input.characterIds, skipped: [] }
      },
      releaseVotes: async (input) => {
        releases.push(input)
      }
    })
    const stub = env.VOTE_COUNTER.get(env.VOTE_COUNTER.idFromName('fixture'))
    const originalIdFromName = env.VOTE_COUNTER.idFromName
    env.VOTE_COUNTER.idFromName = (name: string) => {
      names.push(name)
      return originalIdFromName(name)
    }
    env.VOTE_COUNTER.get = (() => stub) as typeof env.VOTE_COUNTER.get
    state.failTransaction = true
    await expect(submit(env)).rejects.toThrow('D1 unavailable')
    expect(names).toEqual(['2026'])
    expect(state.writeYear).toBe(2026)
    expect(claims).toEqual([
      {
        characterIds: kind === 'single' ? ['sapporo'] : ['sapporo', 'akiba'],
        ip: '203.0.113.1',
        dateKey: '2026-12-31',
        bypassLimit: false
      }
    ])
    expect(releases).toEqual([
      {
        characterIds: kind === 'single' ? ['sapporo'] : ['sapporo', 'akiba'],
        ip: '203.0.113.1',
        dateKey: '2026-12-31'
      }
    ])
  })
}
