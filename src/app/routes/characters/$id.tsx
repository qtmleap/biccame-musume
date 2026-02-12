import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Suspense, useMemo } from 'react'
import { CharacterDetailContent } from '@/components/characters/character-detail-content'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/use-characters'

/**
 * キャラクター詳細ページ
 */
const CharacterDetailPage = ({ id }: { id: string }) => {
  const { data: characters } = useCharacters()

  const character = useMemo(() => {
    return characters.find((c) => c.id === id)
  }, [characters, id])

  if (!character) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <p className='text-destructive mb-4'>キャラクターが見つかりませんでした</p>
          <Link to='/characters'>
            <Button variant='outline'>
              <ArrowLeft className='h-4 w-4 mr-2' />
              一覧に戻る
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return <CharacterDetailContent character={character} />
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => {
  const { id } = Route.useParams()
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CharacterDetailPage id={id} />
    </Suspense>
  )
}

export const Route = createFileRoute('/characters/$id')({
  component: RouteComponent
})
