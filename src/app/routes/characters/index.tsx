import { createFileRoute } from '@tanstack/react-router'
import { useAtom } from 'jotai'
import { Suspense, useMemo } from 'react'
import { sortTypeAtom } from '@/atoms/sortAtom'
import { CharacterSortControl } from '@/components/characters/character-sort-control'
import { CharacterList } from '@/components/characters/character-list'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { useCharacters } from '@/hooks/useCharacters'
import { sortCharacters } from '@/utils/character'

/**
 * キャラクター一覧コンテンツ
 */
const CharactersContent = () => {
  const { data: characters } = useCharacters()
  const [sortType] = useAtom(sortTypeAtom)

  const sortedCharacters = useMemo(() => {
    return sortCharacters(characters, sortType)
  }, [characters, sortType])

  return (
    <div className='min-h-screen'>
      <div className='container mx-auto px-4 py-8'>
        <CharacterSortControl />
        <CharacterList characters={sortedCharacters} />
      </div>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <CharactersContent />
  </Suspense>
)

export const Route = createFileRoute('/characters/')({
  component: RouteComponent
})
