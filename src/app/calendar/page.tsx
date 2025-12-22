import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { charactersQueryKey } from '@/hooks/useCharacters'
import { getCharacters } from '@/lib/characters'
import { CalendarClient } from './calendar-client'

export const metadata: Metadata = {
  title: '誕生日カレンダー',
  description: 'ビッカメ娘の誕生日・記念日カレンダー。キャラクターの誕生日や店舗オープン記念日を月別に確認できます。',
  openGraph: {
    title: '誕生日カレンダー | ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-',
    description: 'ビッカメ娘の誕生日・記念日カレンダー。キャラクターの誕生日や店舗オープン記念日を月別に確認できます。'
  }
}

/**
 * カレンダーページ（Server Component）
 * ビルド時にキャラクターデータをprefetchしてSSG
 */
const CalendarPage = async () => {
  const queryClient = new QueryClient()

  // サーバーサイドでキャラクターデータをprefetch
  await queryClient.prefetchQuery({
    queryKey: charactersQueryKey,
    queryFn: getCharacters
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CalendarClient />
    </HydrationBoundary>
  )
}

export default CalendarPage
