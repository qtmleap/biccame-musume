import { createFileRoute } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
import { Suspense, useMemo, useRef, useState } from 'react'
import { regionFilterAtom } from '@/atoms/filter-atom'
import { sortTypeAtom } from '@/atoms/sort-atom'
import { CharacterList } from '@/components/characters/character-list'
import { CharacterSortControl } from '@/components/characters/character-sort-control'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
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
  const [regionFilter, setRegionFilter] = useAtom(regionFilterAtom)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [randomCounter, setRandomCounter] = useState(0)

  const { sortedMusume, sortedOthers } = useMemo(() => {
    // 地域フィルタリングを適用
    const filteredCharacters = filterCharactersByRegion(characters, regionFilter, query)
    const { musume, others } = categorizeCharacters(filteredCharacters)
    // randomCounterが変わるたびに再計算されるようにする
    void randomCounter
    return {
      sortedMusume: sortCharacters(musume, sortType),
      sortedOthers: sortCharacters(others, sortType)
    }
  }, [characters, sortType, regionFilter, query, randomCounter])

  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl text-foreground'>
      <h1 className='text-2xl font-bold text-foreground mb-4'>ビッカメ娘一覧</h1>
      <div className='mb-4'>
        <label htmlFor='character-search' className='block text-sm font-medium text-foreground mb-2'>
          名前・別名・店舗名で検索
        </label>
        <Input
          ref={searchRef}
          id='character-search'
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='キャラクター名や店舗名を入力'
          className='bg-card dark:bg-card text-foreground placeholder:text-muted-foreground'
        />
      </div>
      <div className='mb-4 grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <RegionFilterControl />
        <CharacterSortControl onRandomize={() => setRandomCounter((prev) => prev + 1)} />
      </div>
      <div className='flex flex-wrap items-center gap-3 mb-6'>
        <p role='status' className='text-sm text-foreground'>
          {sortedMusume.length + sortedOthers.length}件 / 全{characters.length}件
        </p>
        {(query.length > 0 || regionFilter !== 'all') && (
          <Button
            variant='outline'
            className='text-foreground bg-card'
            onClick={() => {
              setQuery('')
              setRegionFilter('all')
              searchRef.current?.focus()
            }}
          >
            条件を解除
          </Button>
        )}
      </div>
      {sortedMusume.length + sortedOthers.length === 0 && (
        <div className='rounded-xl border border-card-border bg-card p-4 text-foreground mb-6'>
          <p className='font-medium'>条件に一致するキャラクターが見つかりません。</p>
          <p className='text-sm mt-2'>検索語や地域を変更するか、条件を解除してください。</p>
        </div>
      )}
      <CharacterList characters={sortedMusume} title={HOME_LABELS.biccameMusumeTitle} showTitle />
      {sortedOthers.length > 0 && (
        <>
          <div className='my-8 border-t-2 border-card' />
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
