import { createFileRoute } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { Search } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { regionFilterAtom } from '@/atoms/filter-atom'
import { sortTypeAtom } from '@/atoms/sort-atom'
import { CharacterList } from '@/components/characters/character-list'
import { CharacterSortControl } from '@/components/characters/character-sort-control'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Input } from '@/components/ui/input'
import { useCharacters } from '@/hooks/use-characters'
import { HOME_LABELS } from '@/locales/app.content'
import { categorizeCharacters, filterCharactersByRegion, sortCharacters } from '@/utils/character'

/**
 * キャラクター一覧コンテンツ
 */
const CharactersContent = () => {
  const { data: characters } = useCharacters()
  const sortType = useAtomValue(sortTypeAtom)
  const regionFilter = useAtomValue(regionFilterAtom)
  const [randomCounter, setRandomCounter] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  const { sortedMusume, sortedOthers } = useMemo(() => {
    // 地域フィルタリングを適用
    const filteredCharacters = filterCharactersByRegion(characters, regionFilter)
    const { musume, others } = categorizeCharacters(filteredCharacters)
    // randomCounterが変わるたびに再計算されるようにする
    void randomCounter

    const sorted = {
      sortedMusume: sortCharacters(musume, sortType),
      sortedOthers: sortCharacters(others, sortType)
    }

    if (!searchQuery.trim()) return sorted

    const query = searchQuery.trim().toLowerCase()
    const matchCharacter = (c: (typeof sorted.sortedMusume)[number]) => {
      const name = c.character?.name?.toLowerCase() ?? ''
      const aliases = c.character?.aliases?.map((a) => a.toLowerCase()) ?? []
      return name.includes(query) || aliases.some((a) => a.includes(query))
    }

    return {
      sortedMusume: sorted.sortedMusume.filter(matchCharacter),
      sortedOthers: sorted.sortedOthers.filter(matchCharacter)
    }
  }, [characters, sortType, regionFilter, randomCounter, searchQuery])

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      {/* 名前検索 */}
      <div className='mb-4 relative'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          type='search'
          placeholder='名前で検索...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='pl-9'
        />
      </div>
      <div className='mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <RegionFilterControl />
        <CharacterSortControl onRandomize={() => setRandomCounter((prev) => prev + 1)} />
      </div>
      <CharacterList characters={sortedMusume} title={HOME_LABELS.biccameMusumeTitle} showTitle />
      {sortedOthers.length > 0 && (
        <>
          <div className='my-8 border-t-2 border-gray-300 dark:border-gray-600' />
          <CharacterList characters={sortedOthers} title={HOME_LABELS.relatedCharactersTitle} showTitle />
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
