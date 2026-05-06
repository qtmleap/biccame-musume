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
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      <header className='mb-4 md:mb-6 text-center'>
        <h1 className='font-display font-black text-3xl md:text-4xl text-foreground tracking-tight'>総選挙</h1>
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
