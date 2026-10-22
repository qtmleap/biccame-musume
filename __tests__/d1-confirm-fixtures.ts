import type { ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import type { CandidateFact } from '../scripts/lib/event-detect/d1-confirm-plan'
import type { Top } from '../scripts/lib/event-detect/d1-gold-candidate'
import { goldEvent } from './d1-gold-fixtures'

export const STATE = [
  '投稿日: 2026-03-10（火）',
  '投稿者: @bic_yuurakuchou / 有楽町店',
  '本文:',
  '有楽町たん名刺を配布します。',
  '抽出段階の開催店舗候補（未確定）: yuurakuchou'
].join('\n')

// 先頭から順に確率を割り当てた最上位つきの選択肢。残りの確率は小さな値で埋める。
export const topOf = (ranked: readonly [string, number][]): Top => {
  const probabilities = Object.fromEntries(ranked)
  return { choice: ranked[0][0], probability: ranked[0][1], probabilities }
}

export const factOf = (overrides: Partial<CandidateFact> = {}): CandidateFact => ({
  caseId: 'd1-gold-1',
  index: 0,
  state: STATE,
  extractionStore: 'yuurakuchou',
  store: topOf([
    ['yuurakuchou', 0.7],
    ['akiba', 0.1],
    ['nanba', 0.05],
    ['multiple', 0.02]
  ]),
  character: topOf([
    ['yuurakuchou', 0.6],
    ['nanba', 0.2],
    ['tenjin', 0.05]
  ]),
  gold: goldEvent({ stores: ['yuurakuchou'], characterIds: [] }),
  ...overrides
})

// 確認の質問すべてに、キーごとの「はい」の確率を返すスタブ応答。
export const yesResponse = (request: ClefRequest, yes: number): ClefResponse => ({
  answers: Object.fromEntries(Object.keys(request.questions).map((key) => [key, { type: 'noul' as const, noul: yes }]))
})
