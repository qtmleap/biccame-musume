import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { RankingList } from '@/components/ranking/ranking-list'
import { useCharacters } from '@/hooks/useCharacters'
import { useVoteRanking } from '@/hooks/useVoteRanking'

export const Route = createFileRoute('/ranking/')({
  component: RouteComponent
})

/**
 * ランキングコンテンツコンポーネント
 */
const RankingContent = () => {
  const { data: characters } = useCharacters()
  const { data: ranking } = useVoteRanking(characters)

  return (
    <div className='min-h-screen bg-linear-to-b from-pink-50 to-white'>
      <div className='container mx-auto px-4 py-6 max-w-3xl'>
        {/* ヘッダー */}
        <div className='mb-6'>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>応援ランキング</h1>
          <p className='text-gray-600'>ビッカメ娘の人気投票ランキング</p>
        </div>

        {/* ランキングリスト */}
        <RankingList characters={ranking} />
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
