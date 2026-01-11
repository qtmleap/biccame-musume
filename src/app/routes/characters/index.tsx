import { createFileRoute } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { Suspense, useMemo, useState } from 'react'
import { regionFilterAtom } from '@/atoms/filterAtom'
import { sortTypeAtom } from '@/atoms/sortAtom'
import { CharacterList } from '@/components/characters/character-list'
import { CharacterSortControl } from '@/components/characters/character-sort-control'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { useCharacters } from '@/hooks/useCharacters'
import { categorizeCharacters, filterCharactersByRegion, sortCharacters } from '@/utils/character'

/**
 * キャラクター一覧コンテンツ
 */
const CharactersContent = () => {
  const { data: characters } = useCharacters()
  const sortType = useAtomValue(sortTypeAtom)
  const regionFilter = useAtomValue(regionFilterAtom)
  const [randomCounter, setRandomCounter] = useState(0)

  const { sortedMusume, sortedOthers } = useMemo(() => {
    // 地域フィルタリングを適用
    const filteredCharacters = filterCharactersByRegion(characters, regionFilter)
    const { musume, others } = categorizeCharacters(filteredCharacters)
    // randomCounterが変わるたびに再計算されるようにする
    void randomCounter
    return {
      sortedMusume: sortCharacters(musume, sortType),
      sortedOthers: sortCharacters(others, sortType)
    }
  }, [characters, sortType, regionFilter, randomCounter])

  return (
    <div className='container mx-auto px-4 md:px-8 py-8 max-w-6xl'>
      <div className='mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <RegionFilterControl />
        <CharacterSortControl onRandomize={() => setRandomCounter((prev) => prev + 1)} />
      </div>
      <CharacterList characters={sortedMusume} title='ビッカメ娘' showTitle />
      {sortedOthers.length > 0 && (
        <>
          <div className='my-8 border-t-2 border-gray-300 dark:border-gray-600' />
          <CharacterList characters={sortedOthers} title='ビッカメ娘の関係者' showTitle />
        </>
      )}
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
