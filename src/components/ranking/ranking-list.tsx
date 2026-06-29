import { BulkVoteButton } from '@/components/characters/bulk-vote-button'
import { RankingEmptyVoteInfo } from './ranking-empty-vote-info'
import { type CharacterWithVotes, calculateRanks } from './ranking-list-helpers'
import { Podium } from './ranking-podium'
import { RankingRow } from './ranking-row'

type RankingListProps = {
  characters: CharacterWithVotes[]
}

/**
 * 投票ランキングリスト
 */
export const RankingList = ({ characters }: RankingListProps) => {
  const biccameCharacters = characters.filter((c) => c.character?.is_biccame_musume)
  const votedCharacters = biccameCharacters.filter((c) => c.voteCount > 0)
  const allBiccameIds = biccameCharacters.map((c) => c.id)
  const ranks = calculateRanks(votedCharacters)
  const maxVote = votedCharacters[0]?.voteCount ?? 0

  const podiumIndices = ranks.map((r, i) => (r <= 3 ? i : -1)).filter((i) => i >= 0)
  const restIndices = ranks.map((_, i) => i).filter((i) => !podiumIndices.includes(i))

  const podiumChars = podiumIndices.map((i) => votedCharacters[i])
  const podiumRanks = podiumIndices.map((i) => ranks[i])

  return (
    <div className='space-y-8'>
      {allBiccameIds.length > 0 && (
        <div className='flex justify-center'>
          <BulkVoteButton characterIds={allBiccameIds} label='ビッカメ娘全員に投票' />
        </div>
      )}

      {votedCharacters.length === 0 ? (
        <RankingEmptyVoteInfo />
      ) : (
        <>
          {/* デスクトップ: 表彰台 + 4位以降グリッド */}
          <div className='hidden md:block space-y-10'>
            <Podium top3={podiumChars} ranks={podiumRanks} maxVote={maxVote} />

            {restIndices.length > 0 && (
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4'>
                {restIndices.map((i, j) => (
                  <RankingRow
                    key={votedCharacters[i].id}
                    character={votedCharacters[i]}
                    rank={ranks[i]}
                    index={j}
                    maxVote={maxVote}
                  />
                ))}
              </div>
            )}
          </div>

          {/* モバイル: 全件リスト */}
          <div className='md:hidden space-y-3'>
            {votedCharacters.map((c, i) => (
              <RankingRow key={c.id} character={c} rank={ranks[i]} index={i} maxVote={maxVote} rotation={0} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
