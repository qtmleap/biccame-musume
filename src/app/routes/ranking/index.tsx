import { createFileRoute } from '@tanstack/react-router'
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

  return (
    <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl'>
      <header className='mb-6'>
        <h1 className='text-3xl md:text-4xl font-bold text-foreground'>総選挙</h1>
        <p className='mt-1 text-sm text-muted-foreground'>1日1回、好きなビッカメ娘に投票してね</p>
      </header>
      <RankingList characters={characters} />
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
