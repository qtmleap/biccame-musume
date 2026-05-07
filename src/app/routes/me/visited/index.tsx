import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, MapPin } from 'lucide-react'
import { Suspense } from 'react'
import { CharacterListCard } from '@/components/character-list-card'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'
import { useUserActivity } from '@/hooks/use-user-activity'
import { auth } from '@/lib/firebase'

/**
 * 訪れた店舗一覧コンテンツ
 */
const VisitedContent = () => {
  const router = useRouter()
  const { stores } = useUserActivity()
  const { data: characters } = useCharacters()

  const visitedCharacters = characters.filter((c) => stores.includes(c.id))

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-4 md:py-6 md:px-8 max-w-6xl'>
        <AppBreadcrumb
          items={[{ label: 'ホーム', to: '/' }, { label: 'マイページ', to: '/me' }, { label: '訪れた店舗' }]}
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
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-bold text-foreground'>訪れた店舗</h1>
            <span className='text-sm text-muted-foreground'>({visitedCharacters.length})</span>
          </div>
        </div>

        {visitedCharacters.length === 0 ? (
          <div className='bg-card rounded-lg shadow-sm p-8 text-center'>
            <MapPin className='h-12 w-12 text-muted-foreground/30 mx-auto mb-3' />
            <p className='text-muted-foreground'>まだ訪問した店舗がありません</p>
            <Link to='/characters' className='inline-block mt-4 text-brand hover:text-brand text-sm font-medium'>
              ビッカメ娘一覧から訪問記録を登録する
            </Link>
          </div>
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'>
            {visitedCharacters.map((character) => (
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
      <VisitedContent />
    </Suspense>
  </ErrorBoundary>
)

export const Route = createFileRoute('/me/visited/')({
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
