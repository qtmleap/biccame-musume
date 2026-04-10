import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { UpcomingEventList } from '@/components/events/upcoming-event-list'
import { BirthdayBackground } from '@/components/home/birthday-background'
import { BirthdayBanner } from '@/components/home/birthday-banner'
import { BirthdayDialog } from '@/components/home/birthday-dialog'
import { BirthdayDisplaySwitcher, type BirthdayDisplayType } from '@/components/home/birthday-display-switcher'
import { BirthdayFloatingCard } from '@/components/home/birthday-floating-card'
import { BirthdayFullscreenOverlay } from '@/components/home/birthday-fullscreen-overlay'
import { BirthdayHeroSection } from '@/components/home/birthday-hero-section'
import { ClearCacheButton } from '@/components/home/clear-cache-button'
import { EventList } from '@/components/home/event-list'
import { HomeHeader } from '@/components/home/home-header'
import { LineStickerList } from '@/components/home/line-sticker-list'
import { useCharacters } from '@/hooks/use-characters'
import { getBirthdayCharacters } from '@/utils/character'

const BirthdayDisplay = ({
  type,
  characters
}: {
  type: BirthdayDisplayType
  characters: ReturnType<typeof getBirthdayCharacters>
}) => {
  switch (type) {
    case 'dialog':
      return <BirthdayDialog characters={characters} />
    case 'fullscreen':
      return <BirthdayFullscreenOverlay characters={characters} />
    case 'banner':
      return <BirthdayBanner characters={characters} />
    case 'hero':
      return <BirthdayHeroSection characters={characters} />
    case 'floating':
      return <BirthdayFloatingCard characters={characters} />
    case 'background':
      return <BirthdayBackground characters={characters} />
    default:
      return null
  }
}

const HomeContent = () => {
  const { data: characters } = useCharacters()
  const [displayType, setDisplayType] = useState<BirthdayDisplayType>('hero')
  const [selectedCharacterId, setSelectedCharacterId] = useState('kyoto')
  const birthdayCharacters = getBirthdayCharacters(characters, selectedCharacterId)

  return (
    <div className='flex flex-col gap-3'>
      <BirthdayDisplaySwitcher
        current={displayType}
        onChange={setDisplayType}
        characters={characters}
        selectedCharacterId={selectedCharacterId}
        onCharacterChange={setSelectedCharacterId}
      />
      <ClearCacheButton />
      <HomeHeader />
      {displayType === 'hero' && <BirthdayHeroSection characters={birthdayCharacters} />}
      <UpcomingEventList characters={characters} />
      <EventList />
      <LineStickerList />
      {displayType !== 'hero' && <BirthdayDisplay type={displayType} characters={birthdayCharacters} />}
    </div>
  )
}

const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <HomeContent />
  </Suspense>
)

export const Route = createFileRoute('/')({
  component: RouteComponent
})
