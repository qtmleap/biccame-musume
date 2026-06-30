import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { UpcomingEventList } from '@/components/events/upcoming-event-list'
import { BirthdayHeroSection } from '@/components/home/birthday-hero-section'
import { EventGroupList } from '@/components/home/event-group-list'
import { EventList } from '@/components/home/event-list'
import { HomeHeader } from '@/components/home/home-header'
import { LineStickerList } from '@/components/home/line-sticker-list'
import { useCharacters } from '@/hooks/use-characters'
import { getBirthdayCharacters } from '@/utils/character'

const HomeContent = () => {
  const { data: characters } = useCharacters()
  const birthdayCharacters = getBirthdayCharacters(characters, 'kyoto')

  return (
    <div className='flex flex-col gap-3'>
      <HomeHeader />
      <BirthdayHeroSection characters={birthdayCharacters} />
      <EventGroupList />
      <UpcomingEventList characters={characters} />
      <EventList />
      <LineStickerList />
    </div>
  )
}

const RouteComponent = () => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/')({
  component: RouteComponent
})
