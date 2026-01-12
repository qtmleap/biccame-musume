import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { RankingList } from '@/components/ranking/ranking-list'
import { useVoteRanking } from '@/hooks/useVoteRanking'

export const Route = createFileRoute('/ranking/')({
  component: RouteComponent
})

/**
 * ランキングコンテンツコンポーネント
 */
const RankingContent = () => {
  const { data: characters } = useVoteRanking()

  return (
    <div className='mx-auto p-4 md:p-8 space-y-6 md:space-y-8 max-w-6xl'>
      <div className='text-center mb-8'>
        <h1 className='text-3xl md:text-4xl font-bold text-gray-900 mb-2'>ビッカメ娘総選挙</h1>
        <p className='text-gray-600'>あなたの推しビッカメ娘を応援しよう！</p>
      </div>
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
