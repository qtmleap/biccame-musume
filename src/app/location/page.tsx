import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { charactersQueryKey } from '@/hooks/useCharacters'
import { getCharacters } from '@/lib/characters'
import { LocationClient } from './location-client'

export const metadata: Metadata = {
  title: '店舗マップ',
  description:
    'ビッカメ娘がいるビックカメラ店舗の位置をマップで確認。各店舗の住所やキャラクター情報を地図上で表示します。',
  openGraph: {
    title: '店舗マップ | ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-',
    description:
      'ビッカメ娘がいるビックカメラ店舗の位置をマップで確認。各店舗の住所やキャラクター情報を地図上で表示します。'
  }
}

/**
 * ロケーションページ（Server Component）
 */
const LocationPage = async () => {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: charactersQueryKey,
    queryFn: getCharacters
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<LoadingFallback />}>
        <LocationClient />
      </Suspense>
    </HydrationBoundary>
  )
}

export default LocationPage
