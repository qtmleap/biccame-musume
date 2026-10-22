type ScoredRow = { id: string; result: { gold: boolean; outcome: string } | null }
const combination = (n: number, k: number) =>
  Array.from({ length: k }, (_, index) => index + 1).reduce((value, index) => (value * (n - index + 1)) / index, 1)

// 同じ陽性ケースでのgain/lossを比較し、単なる件数差だけを改善の証拠にしない。
export const compareGoalDiscovery = (
  before: ScoredRow[],
  after: ScoredRow[],
  labels: { id: string; expected: { isEvent: boolean } }[]
) => {
  const pairs = labels
    .filter((sample) => sample.expected.isEvent)
    .map((sample) => {
      const old = before.find((row) => row.id === sample.id)
      const next = after.find((row) => row.id === sample.id)
      return {
        old: old?.result?.outcome === 'detected',
        next: next?.result?.outcome === 'detected',
        oldUnavailable: old === undefined || old.result === null,
        newUnavailable: next === undefined || next.result === null
      }
    })
  const gained = pairs.filter((pair) => !pair.old && pair.next).length
  const lost = pairs.filter((pair) => pair.old && !pair.next).length
  const discordant = gained + lost
  const probability =
    discordant === 0
      ? 1
      : Math.min(
          1,
          (2 *
            Array.from({ length: Math.min(gained, lost) + 1 }, (_, index) => combination(discordant, index)).reduce(
              (sum, value) => sum + value,
              0
            )) /
            2 ** discordant
        )
  return {
    positivePairs: pairs.length,
    gained,
    lost,
    discordant,
    oldUnavailable: pairs.filter((pair) => pair.oldUnavailable).length,
    newUnavailable: pairs.filter((pair) => pair.newUnavailable).length,
    exactTwoSidedP: probability,
    note: 'Paired provisional-label cases; this is not a population guarantee or a claim that model scores are calibrated.'
  }
}
