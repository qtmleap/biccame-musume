import { useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense } from 'react'
import { CharacterOngoingEvents } from '@/components/characters/character-ongoing-events'
import { CharacterProfileSection } from '@/components/characters/detail/character-profile-section'
import { StoreInfoSection } from '@/components/characters/detail/store-info-section'
import { NearbyCharactersList } from '@/components/characters/nearby-characters-list'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { StoreData, StoreKey } from '@/schemas/store.dto'

type CharacterDetailContentProps = {
  character: StoreData
}

export const CharacterDetailContent = ({ character }: CharacterDetailContentProps) => {
  const router = useRouter()

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='md:grid md:grid-cols-[1fr_auto_320px] md:gap-6'>
          <div className='max-w-2xl'>
            <AppBreadcrumb
              items={[
                { label: 'ホーム', to: '/' },
                { label: 'キャラクター', to: '/characters' },
                { label: character.character?.name ?? 'キャラクター詳細' }
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
            <Suspense fallback={null}>
              <CharacterOngoingEvents storeKey={character.id as StoreKey} />
            </Suspense>
            <StoreInfoSection character={character} />
          </div>

          <Separator orientation='vertical' className='hidden md:block' />

          <div className='hidden md:block pt-4'>
            <div className='sticky top-4'>
              <NearbyCharactersList currentCharacter={character} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
