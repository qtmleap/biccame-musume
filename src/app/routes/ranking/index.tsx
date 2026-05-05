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
    <div className='mx-auto max-w-6xl px-4 pt-6 pb-4 md:px-8 md:pb-6'>
      <header className='mb-4 md:mb-6 text-center'>
        <h1
          className='text-3xl md:text-4xl text-foreground tracking-tight'
          style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 900 }}
        >
          総選挙
        </h1>
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
