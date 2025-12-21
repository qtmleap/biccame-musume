'use client'

import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { UpcomingEventList } from '@/components/events/upcoming-event-list'
import { HomeHeader } from '@/components/home/home-header'
import { LineStickerList } from '@/components/home/line-sticker-list'
import { useCharacters } from '@/hooks/useCharacters'

/**
 * トップページコンテンツ
 */
const HomeContent = () => {
  const { data: characters } = useCharacters()

  return (
    <div>
      <HomeHeader />
      <UpcomingEventList characters={characters} />
      <LineStickerList />
    </div>
  )
}

/**
 * ホームページコンポーネント
 */
const HomePage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  )
}

export default HomePage
