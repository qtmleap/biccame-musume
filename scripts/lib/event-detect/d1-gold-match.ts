import type { CandidateView } from './d1-gold-candidate'
import type { GoldEvent } from './d1-gold-schema'

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
const bigramsOf = (value: string) =>
  value.length < 2 ? [value] : Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))

// 物品名の類似度（0〜1）。2文字の組のDice係数と、片方がもう片方を含むときの下限0.8の大きい方。
export const titleSimilarity = (left: string, right: string) => {
  const a = normalize(left)
  const b = normalize(right)
  if (a === '' || b === '') return 0
  const pool = new Map<string, number>()
  for (const gram of bigramsOf(a)) {
    const current = pool.get(gram)
    pool.set(gram, current === undefined ? 1 : current + 1)
  }
  const shared = bigramsOf(b).reduce((sum, gram) => {
    const remaining = pool.get(gram)
    if (remaining === undefined || remaining < 1) return sum
    pool.set(gram, remaining - 1)
    return sum + 1
  }, 0)
  const dice = (2 * shared) / (bigramsOf(a).length + bigramsOf(b).length)
  const contains = Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a))
  return Math.max(dice, contains ? 0.8 : 0)
}

export const MATCH_TITLE_THRESHOLD = 0.3
export type MatchBasis = 'extraction-store+item' | 'extraction-store' | 'item' | 'sole-candidate'
export type Match = {
  candidate: number
  gold: string
  basis: MatchBasis
  // 判定結果の店舗が正解店舗と一致したことが順位づけに寄与したか（抽出段階の店舗が決め手でないとき）。
  judgedStoreContributed: boolean
}

type Scored = Match & { score: number }

// 突き合わせの規則（一意に決まるよう、順位づけと同点の解消を固定している）。
// 1. 抽出段階の店舗（候補の入力文にある店舗ヒント）が正解の店舗に含まれる、または物品名の類似度が閾値以上のペアだけを対応の候補にする。
//    判定結果（店舗・開始日・種類）は、測りたい値そのものなので対応づけの根拠にしない。
// 2. 得点 = 4×店舗一致 + 3×物品名類似度。同点のときだけ、判定結果の店舗・開始日・種類の一致を小さな重みで足して解消する。
// 3. 得点の高い順（さらに同点なら正解イベントのuuid、候補の番号）に、どちらも未使用のペアを確定する（貪欲法）。
// 4. 候補も正解も1件ずつしかない投稿は、根拠が無くても対応づける（唯一の候補）。
// 5. 本文だけから作った文脈候補（抽出が0件）は対応づけない。
export const matchCandidates = (candidates: readonly CandidateView[], golds: readonly GoldEvent[]) => {
  const real = candidates.filter((candidate) => !candidate.contextOnly)
  const scored = real.flatMap((candidate) =>
    golds.flatMap((gold): Scored[] => {
      const storeHit = candidate.extractionStore !== null && gold.stores.includes(candidate.extractionStore)
      const similarity = titleSimilarity(candidate.item, gold.title)
      const itemHit = similarity >= MATCH_TITLE_THRESHOLD
      const sole = real.length === 1 && golds.length === 1
      if (!storeHit && !itemHit && !sole) return []
      const judgedStore = candidate.store !== null && gold.stores.includes(candidate.store.choice)
      const judgedStart = candidate.startDate === gold.startDateJst
      const judgedCategory = candidate.category === gold.category
      const basis: MatchBasis =
        storeHit && itemHit
          ? 'extraction-store+item'
          : storeHit
            ? 'extraction-store'
            : itemHit
              ? 'item'
              : 'sole-candidate'
      return [
        {
          candidate: candidate.index,
          gold: gold.uuid,
          basis,
          judgedStoreContributed: !storeHit && judgedStore,
          score:
            (storeHit ? 4 : 0) +
            3 * similarity +
            (judgedStore ? 0.3 : 0) +
            (judgedStart ? 0.2 : 0) +
            (judgedCategory ? 0.1 : 0)
        }
      ]
    })
  )
  const ordered = [...scored].sort(
    (a, b) => b.score - a.score || a.gold.localeCompare(b.gold) || a.candidate - b.candidate
  )
  // 貪欲法: 得点の高い順に、候補も正解もまだ使われていないペアだけを確定する。
  const chosen: Scored[] = []
  for (const pair of ordered)
    if (!chosen.some((taken) => taken.candidate === pair.candidate || taken.gold === pair.gold)) chosen.push(pair)
  const matches: Match[] = chosen.map(({ candidate, gold, basis, judgedStoreContributed }) => ({
    candidate,
    gold,
    basis,
    judgedStoreContributed
  }))
  return {
    matches,
    unmatchedGold: golds.filter((gold) => !matches.some((match) => match.gold === gold.uuid)).map((gold) => gold.uuid),
    unmatchedCandidates: real
      .filter((candidate) => !matches.some((match) => match.candidate === candidate.index))
      .map((candidate) => candidate.index),
    contextOnly: candidates.filter((candidate) => candidate.contextOnly).map((candidate) => candidate.index)
  }
}
