import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Heart } from 'lucide-react'
import { Suspense } from 'react'
import { CharacterListCard } from '@/components/character-list-card'
import { BulkVoteButton } from '@/components/characters/bulk-vote-button'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'
import { useFavorites } from '@/hooks/use-favorites'
import { auth } from '@/lib/firebase'

/**
 * お気に入りキャラクター一覧コンテンツ
 */
const FavoritesContent = () => {
  const router = useRouter()
  const { favorites } = useFavorites()
  const { data: characters } = useCharacters()

  const favoriteCharacters = characters.filter((c) => c.character?.is_biccame_musume && favorites.includes(c.id))

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl'>
        <AppBreadcrumb
          items={[
            { label: 'ホーム', to: '/' },
            { label: 'マイページ', to: '/me' },
            { label: '推しのビッカメ娘' }
          ]}
        />
        <div className='mb-6'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 mb-4 border border-transparent'
            onClick={() => router.history.back()}
          >
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
          <div className='flex items-center justify-between flex-wrap gap-3'>
            <div className='flex items-center gap-2'>
              <h1 className='text-2xl font-bold text-foreground'>推しのビッカメ娘</h1>
              <span className='text-sm text-muted-foreground'>({favoriteCharacters.length})</span>
            </div>
            {favoriteCharacters.length > 0 && (
              <BulkVoteButton characterIds={favoriteCharacters.map((c) => c.id)} label='推し全員に投票' />
            )}
          </div>
        </div>

        {favoriteCharacters.length === 0 ? (
          <div className='bg-card rounded-lg shadow-sm p-8 text-center'>
            <Heart className='h-12 w-12 text-muted-foreground/30 mx-auto mb-3' />
            <p className='text-muted-foreground'>まだ推しが登録されてないよ</p>
            <Link to='/characters' className='inline-block mt-4 text-brand hover:text-brand text-sm font-medium'>
              ビッカメ娘一覧から推しを登録する
            </Link>
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
            {favoriteCharacters.map((character) => (
              <CharacterListCard key={character.id} character={character} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const RouteComponent = () => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <FavoritesContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/me/favorites/')({
  component: RouteComponent,
  beforeLoad: async () => {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe()
        if (!user) {
          throw new Error('Unauthorized')
        }
        resolve(undefined)
      })
    })
  },
  onError: ({ error, navigate }) => {
    if (error.message === 'Unauthorized') {
      navigate({ to: '/' })
    }
  }
})
