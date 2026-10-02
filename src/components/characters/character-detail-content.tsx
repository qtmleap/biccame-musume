import { useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { CharacterCompetitionLevel } from '@/components/characters/character-competition-level'
import { CharacterOngoingEvents } from '@/components/characters/character-ongoing-events'
import { CharacterProfileSection } from '@/components/characters/detail/character-profile-section'
import { StoreInfoSection } from '@/components/characters/detail/store-info-section'
import { NearbyCharactersList } from '@/components/characters/nearby-characters-list'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { Button } from '@/components/ui/button'
import type { StoreData, StoreKey } from '@/schemas/store.dto'

type CharacterDetailContentProps = {
  character: StoreData
}

export const CharacterDetailContent = ({ character }: CharacterDetailContentProps) => {
  const router = useRouter()

  return (
    <div className='min-h-screen bg-page-bg text-foreground'>
      <div className='mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6'>
        <div className='grid gap-6 md:grid-cols-[minmax(0,1fr)_224px] lg:grid-cols-[minmax(0,1fr)_280px] md:items-start'>
          <div className='min-w-0 space-y-6'>
            <AppBreadcrumb
              items={[
                { label: 'ホーム', to: '/' },
                { label: 'ビッカメ娘', to: '/characters' },
                { label: character.character?.name ?? 'ビッカメ娘詳細' }
              ]}
            />
            <div className='pb-2'>
              <Button
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
                onClick={() => router.history.back()}
              >
                <ArrowLeft className='h-4 w-4 mr-1' />
                戻る
              </Button>
            </div>

            <CharacterProfileSection character={character} />
            <div className='space-y-6 [&>div]:mb-0 [&>div]:rounded-xl [&>div]:border [&>div]:border-card-border [&>div]:bg-card [&>div]:p-4 md:[&>div]:p-6 [&_a.text-brand]:text-[color:var(--link-foreground)]'>
              <Suspense fallback={null}>
                <CharacterOngoingEvents storeKey={character.id as StoreKey} />
              </Suspense>
              <Suspense fallback={null}>
                <CharacterCompetitionLevel storeKey={character.id as StoreKey} />
              </Suspense>
            </div>
            <StoreInfoSection character={character} />
          </div>

          <aside className='min-w-0' aria-label='近くのビッカメ娘'>
            <div className='md:sticky md:top-4'>
              <NearbyCharactersList currentCharacter={character} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
