import { createFileRoute } from '@tanstack/react-router'
import { Trophy } from 'lucide-react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { RankingList } from '@/components/ranking/ranking-list'
import { useVoteRanking } from '@/hooks/use-vote-ranking'

export const Route = createFileRoute('/ranking/')({
  component: RouteComponent
})

/**
 * ランキングコンテンツコンポーネント
 */
const RankingContent = () => {
  const { data: characters } = useVoteRanking()

  const totalVotes = characters.filter((c) => c.character?.is_biccame_musume).reduce((acc, c) => acc + c.voteCount, 0)

  return (
    <div className='mx-auto max-w-6xl'>
      <header className='px-4 pt-8 pb-6 md:pt-12 md:pb-10 md:px-8'>
        <div className='flex flex-col items-center text-center gap-2'>
          <span className='inline-flex items-center justify-center h-12 w-12 rounded-full bg-rank-gold/20 text-rank-gold-foreground ring-2 ring-rank-gold/40'>
            <Trophy className='h-6 w-6 text-rank-gold' />
          </span>
          <h1
            className='text-3xl md:text-5xl text-foreground tracking-tight'
            style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 900 }}
          >
            総選挙
          </h1>
          <p className='text-sm md:text-base text-muted-foreground'>1日1回、好きなビッカメ娘に投票してね</p>
          <div className='mt-2 flex justify-center'>
            <span className='inline-flex items-center gap-1.5 rounded-full bg-card border-card px-3 py-1 text-xs md:text-sm'>
              <span className='text-muted-foreground'>投票総数</span>
              <span className='tabular-nums font-bold text-foreground'>{totalVotes.toLocaleString()}</span>
              <span className='text-muted-foreground'>票</span>
            </span>
          </div>
        </div>
      </header>
      <div className='px-4 pb-8 md:px-8 md:pb-12'>
        <RankingList characters={characters} />
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
function RouteComponent() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RankingContent />
    </Suspense>
  )
}
