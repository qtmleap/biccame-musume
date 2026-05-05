import { Link } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { BulkVoteButton } from '@/components/characters/bulk-vote-button'
import { DURATION } from '@/lib/motion'
import type { StoreData } from '@/schemas/store.dto'

type CharacterWithVotes = StoreData & {
  voteCount: number
}

type RankingListProps = {
  characters: CharacterWithVotes[]
}

/**
 * 投票案内（票がまだ0件のときの空状態）
 */
const EmptyVoteInfo = () => {
  return (
    <motion.div
      className='text-center py-16'
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: 'easeOut' }}
    >
      <motion.p
        className='text-muted-foreground text-lg mb-6'
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.normal, delay: 0.2 }}
      >
        まだ票が入ってないよ
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.normal, delay: 0.4, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Link
          to='/characters'
          className='inline-block px-4 py-2 bg-brand text-brand-foreground rounded-full hover:bg-brand/90 transition-colors text-sm font-medium shadow-lg hover:shadow-xl'
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
 * ランキングカード
 */
const RankingCard = ({ character, rank, index }: { character: CharacterWithVotes; rank: number; index: number }) => {
  const getRankStyle = (rank: number) => {
    if (rank === 1) return { badge: 'bg-rank-gold text-rank-gold-foreground' }
    if (rank === 2) return { badge: 'bg-rank-silver text-rank-silver-foreground' }
    if (rank === 3) return { badge: 'bg-rank-bronze text-rank-bronze-foreground' }
    return { badge: 'bg-rank-default text-rank-default-foreground' }
  }

  const style = getRankStyle(rank)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.05 }}
    >
      <div className='flex flex-col'>
        <div className={`${style.badge} px-3 py-0.5 rounded-full font-bold text-sm mb-1 self-start`}>{rank}位</div>

        <Link to='/characters/$id' params={{ id: character.id }} className='block'>
          <h3
            className='text-foreground truncate max-w-full text-lg text-center mb-2'
            style={{
              fontFamily: '"Zen Maru Gothic", sans-serif',
              fontWeight: 900,
              WebkitTextStroke: '1px white',
              paintOrder: 'stroke fill'
            }}
          >
            {character.character?.name}
          </h3>

          <div className='relative bg-page-bg h-28 w-full flex items-center justify-center'>
            <img
              src={character.character?.image_url}
              alt={character.character?.name || ''}
              className='h-full w-auto max-w-full object-contain'
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
        </Link>

        {/* 票数バッジ（ハート + 数字のピル） */}
        <div className='mt-3 flex justify-center'>
          <div className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-vote-count text-vote-count-foreground border border-card-border'>
            <Heart className='h-3.5 w-3.5 text-vote-count-icon fill-current' />
            <p
              className='tabular-nums text-sm whitespace-nowrap'
              style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 700 }}
            >
              {character.voteCount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * 投票ランキングリスト
 */
export const RankingList = ({ characters }: RankingListProps) => {
  // ビッカメ娘のみ抽出（全員投票ボタン用にも使う）
  const biccameCharacters = characters.filter((c) => c.character?.is_biccame_musume)
  const votedCharacters = biccameCharacters.filter((c) => c.voteCount > 0)
  const allBiccameIds = biccameCharacters.map((c) => c.id)

  return (
    <div className='space-y-6'>
      {/* 全員投票ボタン（総選挙の中心アクション） */}
      {allBiccameIds.length > 0 && (
        <div className='flex justify-center py-2'>
          <BulkVoteButton characterIds={allBiccameIds} label='ビッカメ娘全員に投票' />
        </div>
      )}

      {votedCharacters.length === 0 ? (
        <EmptyVoteInfo />
      ) : (
        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'>
          {votedCharacters.map((character, index) => {
            const rank = calculateRank(votedCharacters, index)
            return <RankingCard key={character.id} character={character} rank={rank} index={index} />
          })}
        </div>
      )}
    </div>
  )
}
