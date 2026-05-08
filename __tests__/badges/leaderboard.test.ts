import { describe, expect, test } from 'bun:test'
import { assignRanks, computeMyRank, type LeaderboardEntry } from '../../src/lib/leaderboard'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const alice: LeaderboardEntry = {
  uid: 'alice',
  displayName: 'Alice',
  earnedCount: 30,
  firstEarned: '2026-01-01T00:00:00.000Z'
}

const bob: LeaderboardEntry = {
  uid: 'bob',
  displayName: 'Bob',
  earnedCount: 20,
  firstEarned: '2026-01-02T00:00:00.000Z'
}

const carol: LeaderboardEntry = {
  uid: 'carol',
  displayName: 'Carol',
  earnedCount: 20,
  firstEarned: '2026-01-03T00:00:00.000Z' // same count as bob, but later
}

const dave: LeaderboardEntry = {
  uid: 'dave',
  displayName: 'Dave',
  earnedCount: 10,
  firstEarned: '2026-01-04T00:00:00.000Z'
}

// Pre-sorted as the DB returns (earned_count DESC, first_earned ASC):
// alice(30), bob(20, Jan-02), carol(20, Jan-03), dave(10)
const SORTED_ROWS = [alice, bob, carol, dave]

// ---------------------------------------------------------------------------
// assignRanks
// ---------------------------------------------------------------------------

describe('assignRanks', () => {
  test('assigns 1-indexed ranks to already-sorted rows', () => {
    const ranked = assignRanks(SORTED_ROWS)
    expect(ranked[0]?.rank).toBe(1)
    expect(ranked[1]?.rank).toBe(2)
    expect(ranked[2]?.rank).toBe(3)
    expect(ranked[3]?.rank).toBe(4)
  })

  test('first entry has rank 1', () => {
    const ranked = assignRanks(SORTED_ROWS)
    expect(ranked[0]?.rank).toBe(1)
    expect(ranked[0]?.uid).toBe('alice')
  })

  test('preserves all entry fields', () => {
    const ranked = assignRanks([alice])
    expect(ranked[0]?.uid).toBe(alice.uid)
    expect(ranked[0]?.displayName).toBe(alice.displayName)
    expect(ranked[0]?.earnedCount).toBe(alice.earnedCount)
  })

  test('orders by earned_count descending (highest count = rank 1)', () => {
    const ranked = assignRanks(SORTED_ROWS)
    expect(ranked[0]?.earnedCount).toBeGreaterThanOrEqual(ranked[1]?.earnedCount ?? 0)
    expect(ranked[1]?.earnedCount).toBeGreaterThanOrEqual(ranked[2]?.earnedCount ?? 0)
    expect(ranked[2]?.earnedCount).toBeGreaterThanOrEqual(ranked[3]?.earnedCount ?? 0)
  })

  test('tie: earlier firstEarned comes first (bob before carol)', () => {
    const ranked = assignRanks(SORTED_ROWS)
    const bobEntry = ranked.find((r) => r.uid === 'bob')
    const carolEntry = ranked.find((r) => r.uid === 'carol')
    expect(bobEntry).toBeDefined()
    expect(carolEntry).toBeDefined()
    if (bobEntry && carolEntry) {
      expect(bobEntry.rank).toBeLessThan(carolEntry.rank)
    }
  })

  test('returns empty array for empty input', () => {
    expect(assignRanks([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeMyRank
// ---------------------------------------------------------------------------

describe('computeMyRank', () => {
  test('user with highest count gets rank 1', () => {
    const rank = computeMyRank(SORTED_ROWS, 30, '2026-01-01T00:00:00.000Z')
    expect(rank).toBe(1)
  })

  test('user with unique second-highest count gets rank 2', () => {
    // A new user with 25 badges — only alice (30) beats them
    const rank = computeMyRank(SORTED_ROWS, 25, '2026-01-01T12:00:00.000Z')
    expect(rank).toBe(2)
  })

  test('tiebreak: earlier firstEarned wins', () => {
    // Bob and carol both have 20. Bob earned earlier → rank 2, carol → rank 3.
    const bobRank = computeMyRank(SORTED_ROWS, 20, bob.firstEarned)
    const carolRank = computeMyRank(SORTED_ROWS, 20, carol.firstEarned)
    expect(bobRank).toBe(2)
    expect(carolRank).toBe(3)
  })

  test('user at the bottom has rank = total users', () => {
    const rank = computeMyRank(SORTED_ROWS, 5, '2026-02-01T00:00:00.000Z')
    expect(rank).toBe(SORTED_ROWS.length + 1)
  })

  test('null firstEarned means no tiebreak advantage (does not beat anyone with same count)', () => {
    // myFirstEarned=null means the tiebreak condition `myFirstEarned !== null` is false.
    // So a user with 20 badges and null firstEarned does not beat bob or carol.
    const rank = computeMyRank(SORTED_ROWS, 20, null)
    // alice(30) beats us. bob and carol also have 20 but we don't beat them.
    // Nobody with same count and earlier firstEarned beats us (because we have null).
    // So rankAbove = 1 (only alice) → rank 2.
    expect(rank).toBe(2)
  })

  test('rank 1 for only user in empty leaderboard', () => {
    const rank = computeMyRank([], 5, '2026-01-01T00:00:00.000Z')
    expect(rank).toBe(1)
  })

  test('me.rank reflects correct position when user is in the middle', () => {
    // dave has 10 badges — alice(30), bob(20), carol(20) all beat dave
    const rank = computeMyRank(SORTED_ROWS, 10, dave.firstEarned)
    expect(rank).toBe(4)
  })
})
