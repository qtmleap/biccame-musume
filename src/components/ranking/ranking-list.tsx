import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { getCharacterImageUrl } from '@/lib/utils'
import type { Character } from '@/schemas/character.dto'

type CharacterWithVotes = Character & {
  voteCount: number
}

type RankingListProps = {
  characters: CharacterWithVotes[]
  limit?: number
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
 * ランキングカード（共通コンポーネント）
 */
const RankingCard = ({ character, rank, index }: { character: CharacterWithVotes; rank: number; index: number }) => {
  const getRankStyle = (rank: number) => {
    if (rank === 1) return { badge: 'bg-yellow-400', text: 'text-yellow-600', size: 'h-40 w-40' }
    if (rank === 2) return { badge: 'bg-gray-400', text: 'text-gray-500', size: 'h-36 w-36' }
    if (rank === 3) return { badge: 'bg-amber-600', text: 'text-amber-600', size: 'h-36 w-36' }
    return { badge: 'bg-gray-300', text: 'text-gray-500', size: 'h-28 w-28' }
  }

  const style = getRankStyle(rank)
  const isTop3 = rank <= 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link to='/characters/$id' params={{ id: character.key }} className='group block'>
        <div className='flex flex-col items-center text-center'>
          {/* 画像（白色透過） - 背景色をページに合わせてmix-blend-modeを有効化 */}
          <div className='relative bg-pink-50'>
            <img
              src={getCharacterImageUrl(character)}
              alt={character.character_name}
              className={`${style.size} object-contain`}
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>

          {/* ランクバッジ */}
          <div
            className={`${style.badge} text-white px-3 py-0.5 rounded-full font-bold mb-1 ${isTop3 ? 'text-base' : 'text-sm'}`}
          >
            {rank}位
          </div>

          {/* キャラクター名 */}
          <h3
            className={`font-bold text-gray-900 group-hover:text-[#e50012] transition-colors truncate max-w-full ${isTop3 ? 'text-base' : 'text-sm'}`}
          >
            {character.character_name}
          </h3>

          {/* 票数 */}
          <p className={`${style.text} font-semibold tabular-nums ${isTop3 ? 'text-base' : 'text-sm'}`}>
            {character.voteCount.toLocaleString()}
            <span className='text-xs ml-0.5'>票</span>
          </p>
        </div>
      </Link>
    </motion.div>
  )
}

/**
 * 投票ランキングリスト
 */
export const RankingList = ({ characters, limit = 10 }: RankingListProps) => {
  // 0票のキャラクターを除外
  const votedCharacters = characters.filter((char) => char.voteCount > 0)
  const top3 = votedCharacters.slice(0, 3)
  const restCharacters = votedCharacters.slice(3, limit)
  const totalCount = votedCharacters.length

  return (
    <div className='space-y-6'>
      {votedCharacters.length === 0 ? (
        <motion.div
          className='text-center py-16'
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <motion.p
            className='text-gray-500 text-lg mb-6'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            現在投票受付中です
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4, type: 'spring', stiffness: 200 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to='/characters'
              className='inline-block px-6 py-3 bg-[#e50012] text-white rounded-full hover:bg-[#c40010] transition-colors text-sm font-medium shadow-lg hover:shadow-xl'
            >
              キャラクター一覧を見る
            </Link>
          </motion.div>
        </motion.div>
      ) : (
        <>
          {/* TOP3（1列） */}
          {top3.length > 0 && (
            <div className='grid grid-cols-1 gap-4'>
              {top3.map((character, index) => {
                const rank = calculateRank(votedCharacters, index)
                return <RankingCard key={character.key} character={character} rank={rank} index={index} />
              })}
            </div>
          )}

          {/* 4位以降（2列） */}
          {restCharacters.length > 0 && (
            <div className='grid grid-cols-2 gap-4'>
              {restCharacters.map((character, index) => {
                const actualIndex = index + 3
                const rank = calculateRank(votedCharacters, actualIndex)
                return <RankingCard key={character.key} character={character} rank={rank} index={actualIndex} />
              })}
            </div>
          )}

          {/* 総合順位リンク */}
          {totalCount > limit && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className='text-center'
            >
              <Link
                to='/characters'
                className='inline-block text-sm text-[#e50012] hover:text-[#c40010] font-medium transition-colors'
              >
                総合順位を見る
              </Link>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
