import { useSuspenseQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { StoreData } from '@/schemas/store.dto'
import { client } from '@/utils/client'

type CharacterWithVotes = StoreData & {
  voteCount: number
}

/**
 * 開発環境かどうかを判定
 */
const isDevelopment = () => {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

/**
 * 開発環境用のダミー投票データを生成（合計約10万票）
 */
const generateDummyVoteCounts = (characters: Store[]): Record<string, number> => {
  // ビッカメ娘のみを対象にする
  const biccameMusumeCharacters = characters.filter((char) => char.character?.isBiccameMusume)

  const totalTargetVotes = 100000
  const dummyCounts: Record<string, number> = {}

  // シード値を使った疑似ランダム（リロードしても同じ結果になる）
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }

  // 上位キャラクターに多く票が集まるようにする（指数的減少）
  const weights = biccameMusumeCharacters.map((_, index) => 0.85 ** index)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  for (const [index, character] of biccameMusumeCharacters.entries()) {
    // 重みに基づいて票を配分し、キャラクターidベースの疑似ランダム性を加える
    const baseVotes = Math.floor((weights[index] / totalWeight) * totalTargetVotes)
    const seed = character.id.charCodeAt(0) + character.id.length * 100
    const randomFactor = 0.8 + seededRandom(seed) * 0.4 // 0.8〜1.2の範囲
    dummyCounts[character.id] = Math.floor(baseVotes * randomFactor)
  }

  return dummyCounts
}

/**
 * 全キャラクターの投票数を取得
 */
const fetchVoteRanking = async (characters: Store[], year: number): Promise<CharacterWithVotes[]> => {
  // 開発環境ではダミーデータを使用
  let allVoteCounts: Record<string, number>

  if (isDevelopment()) {
    allVoteCounts = generateDummyVoteCounts(characters)
  } else {
    // Zodiosを使ってAPIリクエスト
    const rawData = await client.getAllVoteCounts({ queries: { year: year.toString() } })

    // "年:ID"形式のデータを"ID"形式に変換
    allVoteCounts = {}
    for (const [key, count] of Object.entries(rawData)) {
      // "2025:kyoto" -> "kyoto"
      const characterKey = key.includes(':') ? key.split(':')[1] : key
      allVoteCounts[characterKey] = count
    }
  }

  // キャラクターと投票数をマージ
  const voteCounts = characters.map((character) => ({
    ...character,
    voteCount: allVoteCounts[character.id] || 0
  }))

  return voteCounts.sort((a, b) => b.voteCount - a.voteCount)
}

/**
 * 投票ランキング取得用のカスタムフック
 */
export const useVoteRanking = (characters: Store[], year?: number) => {
  const targetYear = year || dayjs().year()

  return useSuspenseQuery({
    queryKey: ['voteRanking', characters.length, targetYear],
    queryFn: () => fetchVoteRanking(characters, targetYear),
    staleTime: 1000 * 30, // 30秒間キャッシュ
    refetchInterval: 1000 * 60, // 1分ごとに再取得
    refetchOnMount: true,
    refetchOnWindowFocus: true
  })
}
