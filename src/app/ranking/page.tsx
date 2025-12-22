import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { charactersQueryKey } from '@/hooks/useCharacters'
import { getCharacters } from '@/lib/characters'
import { RankingClient } from './ranking-client'

export const metadata: Metadata = {
  title: '人気投票ランキング',
  description:
    'ビッカメ娘人気投票ランキング。ファンによる投票結果をリアルタイムで確認できます。推しキャラクターに投票しよう！',
  openGraph: {
    title: '人気投票ランキング | ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-',
    description:
      'ビッカメ娘人気投票ランキング。ファンによる投票結果をリアルタイムで確認できます。推しキャラクターに投票しよう！'
  }
}

// SSR: リクエストごとにレンダリング
export const dynamic = 'force-dynamic'

/**
 * ランキングページ（Server Component）
 */
const RankingPage = async () => {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: charactersQueryKey,
    queryFn: getCharacters
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RankingClient />
    </HydrationBoundary>
  )
}

export default RankingPage
