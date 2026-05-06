/**
 * Pure-function helpers for leaderboard rank computation.
 * Extracted for testability — no Prisma/D1 dependency.
 */

export type LeaderboardEntry = {
  uid: string
  displayName: string | null
  thumbnailURL?: string
  earnedCount: number
  firstEarned: string // ISO-8601 or comparable string
}

export type RankedEntry = LeaderboardEntry & {
  rank: number
}

/**
 * Given a list of leaderboard rows already sorted by the DB
 * (earned_count DESC, first_earned ASC), assign 1-indexed ranks.
 * The DB guarantees uniqueness of (earned_count, first_earned) ordering,
 * so ranks are simply positional (1, 2, 3, ...).
 */
export function assignRanks(rows: LeaderboardEntry[]): RankedEntry[] {
  return rows.map((row, idx) => ({ ...row, rank: idx + 1 }))
}

/**
 * Given a full list of leaderboard entries (unsorted) and the current user's
 * stats, compute the user's rank using the same tiebreak rule:
 *   rank = (number of users with earned_count > myCount
 *           OR (same count AND earlier firstEarned)) + 1
 */
export function computeMyRank(allEntries: LeaderboardEntry[], myCount: number, myFirstEarned: string | null): number {
  const rankAbove = allEntries.filter((e) => {
    if (e.earnedCount > myCount) return true
    if (e.earnedCount === myCount && myFirstEarned !== null && e.firstEarned < myFirstEarned) return true
    return false
  }).length
  return rankAbove + 1
}
