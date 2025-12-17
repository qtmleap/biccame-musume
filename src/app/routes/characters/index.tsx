import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { ArrowUpDown } from 'lucide-react'
import { LayoutGroup } from 'motion/react'
import { Suspense, useCallback, useMemo } from 'react'
import { sortTypeAtom } from '@/atoms/sortAtom'
import { CharacterListCard } from '@/components/character-list-card'
import { Button } from '@/components/ui/button'
import { useCharacters } from '@/hooks/useCharacters'

/**
 * ローディングフォールバック
 */
const LoadingFallback = () => (
  <div className='min-h-screen flex items-center justify-center'>
    <div className='text-center'>
      <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4' />
      <p className='text-muted-foreground'>読み込み中...</p>
    </div>
  </div>
)

/**
 * キャラクター一覧コンテンツ
 */
const CharactersContent = () => {
  const { data: characters } = useCharacters()
  const [sortType, setSortType] = useAtom(sortTypeAtom)

  /**
   * 日付文字列を解析してdayjsオブジェクトに変換
   */
  const parseDate = useCallback((dateStr: string | undefined): dayjs.Dayjs | null => {
    if (!dateStr) return null
    const parsed = dayjs(dateStr)
    if (!parsed.isValid()) return null
    return parsed
  }, [])

  /**
   * 誕生日が近い順にソートするための日数計算
   */
  const getDaysUntilBirthday = useCallback(
    (dateStr: string | undefined): number => {
      const birthday = parseDate(dateStr)
      if (!birthday) return Number.MAX_SAFE_INTEGER

      const now = dayjs()
      const thisYear = now.year()
      let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())

      if (nextBirthday.isBefore(now, 'day') || nextBirthday.isSame(now, 'day')) {
        nextBirthday = nextBirthday.add(1, 'year')
      }

      return nextBirthday.diff(now, 'day')
    },
    [parseDate]
  )

  /**
   * ソート処理
   */
  const sortedCharacters = useMemo(() => {
    return [...characters].sort((a, b) => {
      if (sortType === 'character_birthday') {
        const dateA = parseDate(a.character_birthday)
        const dateB = parseDate(b.character_birthday)
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return dateA.valueOf() - dateB.valueOf()
      }

      if (sortType === 'store_birthday') {
        const dateA = parseDate(a.store_birthday)
        const dateB = parseDate(b.store_birthday)
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return dateA.valueOf() - dateB.valueOf()
      }

      if (sortType === 'upcoming_birthday') {
        const daysA = getDaysUntilBirthday(a.character_birthday)
        const daysB = getDaysUntilBirthday(b.character_birthday)
        return daysA - daysB
      }

      return 0
    })
  }, [characters, sortType, parseDate, getDaysUntilBirthday])

  return (
    <div className='min-h-screen'>
      <div className='container mx-auto px-4 py-8'>
        <div className='max-w-2xl mx-auto mb-8'>
          <div className='bg-white/80 rounded-lg p-4 shadow-sm'>
            <div className='flex items-center gap-2 mb-3'>
              <ArrowUpDown className='h-4 w-4 text-gray-600' />
              <span className='text-sm font-medium text-gray-700'>並び替え</span>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
              <Button
                variant='outline'
                onClick={() => setSortType('character_birthday')}
                className={`w-full ${
                  sortType === 'character_birthday'
                    ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:text-white dark:bg-blue-500 dark:text-white dark:border-blue-500 dark:hover:bg-blue-600'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800'
                }`}
              >
                キャラ誕生日順
              </Button>
              <Button
                variant='outline'
                onClick={() => setSortType('store_birthday')}
                className={`w-full ${
                  sortType === 'store_birthday'
                    ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:text-white dark:bg-blue-500 dark:text-white dark:border-blue-500 dark:hover:bg-blue-600'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800'
                }`}
              >
                店舗誕生日順
              </Button>
              <Button
                variant='outline'
                onClick={() => setSortType('upcoming_birthday')}
                className={`w-full ${
                  sortType === 'upcoming_birthday'
                    ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:text-white dark:bg-blue-500 dark:text-white dark:border-blue-500 dark:hover:bg-blue-600'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-200/90 dark:text-gray-800 dark:border-gray-300 dark:hover:bg-gray-200 dark:hover:text-gray-800'
                }`}
              >
                誕生日が近い順
              </Button>
            </div>
          </div>
        </div>

        <LayoutGroup>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {sortedCharacters.map((character) => (
              <CharacterListCard key={character.key} character={character} />
            ))}
          </div>
        </LayoutGroup>
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
