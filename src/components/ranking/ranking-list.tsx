import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import type { Character } from '@/schemas/character.dto'

type CharacterWithVotes = Character & {
  voteCount: number
}

type RankingListProps = {
  characters: CharacterWithVotes[]
}

/**
 * 順位を計算（同数の場合は同じ順位）
 */
const calculateRank = (characters: CharacterWithVotes[], index: number): number => {
  if (index === 0) return 1
  
  const currentVoteCount = characters[index].voteCount
  const previousVoteCount = characters[index - 1].voteCount
  
  if (currentVoteCount === previousVoteCount) {
    return calculateRank(characters, index - 1)
  }
  
  return index + 1
}

/**
 * 投票ランキングリスト
 */
export const RankingList = ({ characters }: RankingListProps) => {
  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-600'
    if (rank === 2) return 'text-gray-400'
    if (rank === 3) return 'text-amber-700'
    return 'text-gray-600'
  }

  const getRankBg = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300'
    if (rank === 2) return 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300'
    if (rank === 3) return 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300'
    return 'bg-white border-gray-200'
  }

  return (
    <div className='space-y-2'>
      {characters.map((character, index) => {
        const rank = calculateRank(characters, index)

        return (
          <motion.div
            key={character.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Link to='/characters/$id' params={{ id: character.key }}>
              <Card className={`p-3 hover:shadow-lg transition-all border-2 ${getRankBg(rank)}`}>
                <div className='flex items-center gap-3'>
                  {/* ランク */}
                  <div className={`text-2xl font-bold ${getRankColor(rank)} w-8 text-center shrink-0`}>{rank}</div>

                  {/* アバター */}
                  <Avatar className='h-12 w-12 shrink-0 border-2 border-white shadow-md'>
                    <AvatarImage
                      src={character.image_urls?.[1] || character.image_urls?.[0]}
                      alt={character.character_name}
                      className='object-cover'
                    />
                    <AvatarFallback className='bg-pink-100 text-pink-700 text-sm'>
                      {character.character_name[0]}
                    </AvatarFallback>
                  </Avatar>

                  {/* キャラクター情報 */}
                  <div className='flex-1 min-w-0'>
                    <h3 className='font-bold text-base text-gray-900 truncate'>{character.character_name}</h3>
                  </div>

                  {/* 投票数 */}
                  <div className='text-right shrink-0 min-w-15'>
                    <div className='text-lg font-bold text-[#e50012] truncate tabular-nums'>
                      {character.voteCount.toLocaleString()}
                    </div>
                    <div className='text-xs text-gray-500'>票</div>
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
