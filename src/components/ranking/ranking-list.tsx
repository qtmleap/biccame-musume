import { motion } from 'motion/react'
import Link from 'next/link'
import { getCharacterImageUrl } from '@/lib/utils'
import type { Character } from '@/schemas/character.dto'

type CharacterWithVotes = Character & {
  voteCount: number
}

type RankingListProps = {
  characters: CharacterWithVotes[]
}

/**
 * リボン装飾コンポーネント（サンリオ風）
 * シンプルな長方形+ボーダー
 */
const RibbonBadge = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className='inline-flex items-center justify-center bg-[#0068B7] border-2 border-[#004080] px-4 py-0.5 min-w-24'>
      {children}
    </div>
  )
}

/**
 * 投票案内コンポーネント
 */
type VoteInfoProps = {
  showSubMessage?: boolean
  compact?: boolean
}

const VoteInfo = ({ showSubMessage = false, compact = false }: VoteInfoProps) => {
  return (
    <motion.div
      className={compact ? 'text-center py-6' : 'text-center py-16'}
      initial={{ opacity: 0, y: compact ? 20 : 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: compact ? 0.5 : 0.6, ease: 'easeOut' }}
    >
      <motion.p
        className={compact ? 'text-gray-700 text-base mb-4 font-bold' : 'text-gray-700 text-lg mb-4 font-bold'}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: compact ? 0.1 : 0.2 }}
      >
        各ビッカメ娘を1日に1回応援できます
      </motion.p>
      {showSubMessage && (
        <motion.p
          className='text-gray-500 text-base mb-6'
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          現在投票受付中です
        </motion.p>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: compact ? 0.4 : 0.5, delay: compact ? 0.2 : 0.4, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Link
          href='/characters'
          className='inline-block px-4 py-2 bg-[#e50012] text-white rounded-full hover:bg-[#c40010] transition-colors text-sm font-medium shadow-lg hover:shadow-xl'
        >
          ビッカメ娘一覧を見る
        </Link>
      </motion.div>
    </motion.div>
  )
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
    if (rank === 1) return { badge: 'bg-yellow-400 text-yellow-900' }
    if (rank === 2) return { badge: 'bg-gray-400 text-gray-900' }
    if (rank === 3) return { badge: 'bg-amber-600 text-white' }
    return { badge: 'bg-blue-500 text-white' }
  }

  const style = getRankStyle(rank)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <div className='flex flex-col'>
        {/* 順位（左寄せ） */}
        <div className={`${style.badge} px-3 py-0.5 rounded-full font-bold text-sm mb-1 self-start`}>{rank}位</div>

        {/* キャラクター名（中央揃え、ポップなフォント、縁取り） */}
        <h3
          className='text-gray-900 truncate max-w-full text-lg text-center mb-2'
          style={{
            fontFamily: '"Zen Maru Gothic", sans-serif',
            fontWeight: 900,
            WebkitTextStroke: '1px white',
            paintOrder: 'stroke fill'
          }}
        >
          {character.character_name}
        </h3>

        {/* 画像（白色透過） */}
        <div className='relative bg-pink-50 h-28 w-full flex items-center justify-center'>
          <img
            src={getCharacterImageUrl(character)}
            alt={character.character_name}
            className='h-full w-auto max-w-full object-contain'
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>

        {/* 票数（リボン装飾） */}
        <div className='mt-3 flex justify-center'>
          <RibbonBadge>
            <p
              className='text-white tabular-nums text-base text-center whitespace-nowrap'
              style={{
                fontFamily: '"Zen Maru Gothic", sans-serif',
                fontWeight: 700
              }}
            >
              {character.voteCount.toLocaleString()}
              <span className='text-xs ml-0.5'>票</span>
            </p>
          </RibbonBadge>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * 投票ランキングリスト
 */
export const RankingList = ({ characters }: RankingListProps) => {
  // ビッカメ娘かつ0票より多いキャラクターのみ表示
  const votedCharacters = characters.filter((char) => char.is_biccame_musume && char.voteCount > 0)

  return (
    <div className='space-y-6'>
      {votedCharacters.length === 0 ? (
        <VoteInfo showSubMessage={true} compact={false} />
      ) : (
        <>
          {/* 投票案内とキャラクター一覧へのリンク */}
          <VoteInfo showSubMessage={false} compact={true} />

          {/* ランキング(モバイル2列、タブレット3列、デスクトップ4列、ワイド5列、超ワイド6列) */}
          <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'>
            {votedCharacters.map((character, index) => {
              const rank = calculateRank(votedCharacters, index)
              return <RankingCard key={character.key} character={character} rank={rank} index={index} />
            })}
          </div>
        </>
      )}
    </div>
  )
}
