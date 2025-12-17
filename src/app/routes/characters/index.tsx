import { createFileRoute } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { Suspense, useMemo, useState } from 'react'
import { sortTypeAtom } from '@/atoms/sortAtom'
import { CharacterList } from '@/components/characters/character-list'
import { CharacterSortControl } from '@/components/characters/character-sort-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { useCharacters } from '@/hooks/useCharacters'
import { categorizeCharacters, sortCharacters } from '@/utils/character'

/**
 * キャラクター一覧コンテンツ
 */
const CharactersContent = () => {
  const { data: characters } = useCharacters()
  const sortType = useAtomValue(sortTypeAtom)
  const [randomCounter, setRandomCounter] = useState(0)

  const { sortedMusume, sortedOthers } = useMemo(() => {
    const { musume, others } = categorizeCharacters(characters)
    // randomCounterが変わるたびに再計算されるようにする
    void randomCounter
    return {
      sortedMusume: sortCharacters(musume, sortType),
      sortedOthers: sortCharacters(others, sortType)
    }
  }, [characters, sortType, randomCounter])

  return (
    <div className='min-h-screen'>
      <div className='container mx-auto px-4 py-8'>
        <CharacterSortControl onRandomize={() => setRandomCounter((prev) => prev + 1)} />
        <CharacterList characters={sortedMusume} title='ビッカメ娘' showTitle={sortedOthers.length > 0} />
        {sortedOthers.length > 0 && (
          <>
            <div className='my-8 border-t-2 border-gray-300 dark:border-gray-600' />
            <CharacterList characters={sortedOthers} title='ビッカメ娘の関係者' showTitle />
          </>
        )}
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
