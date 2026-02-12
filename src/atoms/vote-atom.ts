import { atomWithStorage } from 'jotai/utils'

type VoteRecord = {
  [characterId: string]: string // ISO 8601形式の日時文字列
}

/**
 * 各キャラクターの最後の投票時間を保存するatom
 * localStorageに永続化される
 */
export const lastVoteTimesAtom = atomWithStorage<VoteRecord>('biccame-last-vote-times', {})
