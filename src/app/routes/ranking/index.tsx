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
    <div className='mx-auto p-4 md:p-8 space-y-6 md:space-y-8 max-w-6xl'>
      {/* ランキングリスト */}
      <RankingList characters={ranking} />
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
