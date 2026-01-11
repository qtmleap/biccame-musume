import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { Filter, Gift, Settings } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { prefectureToRegion, regionFilterAtom } from '@/atoms/filterAtom'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { EventGanttChart } from '@/components/events/event-gantt-chart'
import { Checkbox } from '@/components/ui/checkbox'
import { useCharacters } from '@/hooks/useCharacters'
import { useEvents } from '@/hooks/useEvents'
import type { Event } from '@/schemas/event.dto'

/**
 * カテゴリラベル
 */
const CATEGORY_LABELS: Record<Event['category'], string> = {
  ackey: 'アクキー',
  limited_card: '限定名刺',
  regular_card: '通年名刺',
  other: 'その他'
}

/**
 * カテゴリチェックボックス色
 */
const CATEGORY_CHECKBOX_COLORS: Record<Event['category'], string> = {
  ackey: 'border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500',
  limited_card: 'border-purple-500 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500',
  regular_card: 'border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500',
  other: 'border-pink-500 data-[state=checked]:bg-pink-500 data-[state=checked]:border-pink-500'
}

/**
 * イベント一覧のコンテンツ
 */
const EventsContent = () => {
  const { data: events = [], isLoading } = useEvents()
  const { data: characters } = useCharacters()
  const [categoryFilter, setCategoryFilter] = useState<Set<Event['category']>>(
    new Set(['ackey', 'limited_card', 'regular_card', 'other'])
  )
  const regionFilter = useAtomValue(regionFilterAtom)

  // 店舗名から都道府県を取得するマップ
  const storePrefectureMap = useMemo(() => {
    const map = new Map<string, string>()
    const prefectures = Object.keys({
      北海道: true,
      青森県: true,
      岩手県: true,
      宮城県: true,
      秋田県: true,
      山形県: true,
      福島県: true,
      茨城県: true,
      栃木県: true,
      群馬県: true,
      埼玉県: true,
      千葉県: true,
      東京都: true,
      神奈川県: true,
      新潟県: true,
      富山県: true,
      石川県: true,
      福井県: true,
      山梨県: true,
      長野県: true,
      岐阜県: true,
      静岡県: true,
      愛知県: true,
      三重県: true,
      滋賀県: true,
      京都府: true,
      大阪府: true,
      兵庫県: true,
      奈良県: true,
      和歌山県: true,
      鳥取県: true,
      島根県: true,
      岡山県: true,
      広島県: true,
      山口県: true,
      徳島県: true,
      香川県: true,
      愛媛県: true,
      高知県: true,
      福岡県: true,
      佐賀県: true,
      長崎県: true,
      熊本県: true,
      大分県: true,
      宮崎県: true,
      鹿児島県: true,
      沖縄県: true
    })
    for (const char of characters) {
      if (char.name && char.address) {
        const prefecture = prefectures.find((pref) => char.address?.includes(pref))
        if (prefecture) {
          map.set(char.name, prefecture)
        }
      }
    }
    return map
  }, [characters])

  /**
   * カテゴリフィルターのトグル
   */
  const toggleCategory = (category: Event['category']) => {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // 開催中・開催予定のイベントをフィルタリング
  const activeEvents = useMemo(() => {
    const currentTime = dayjs()
    return events
      .filter((event) => {
        // カテゴリフィルター
        if (!categoryFilter.has(event.category)) return false

        // 地域フィルター
        if (regionFilter !== 'all') {
          // 店舗がない場合は表示しない
          if (!event.stores || event.stores.length === 0) return false
          // いずれかの店舗が選択された地域に属するかチェック
          const hasMatchingStore = event.stores.some((storeName) => {
            const prefecture = storePrefectureMap.get(storeName)
            if (!prefecture) return false
            return prefectureToRegion[prefecture] === regionFilter
          })
          if (!hasMatchingStore) return false
        }

        const startDate = dayjs(event.startDate)
        const endDate = event.endDate ? dayjs(event.endDate) : null

        // 終了後1週間経過したイベントは非表示
        if (endDate?.add(7, 'day').isBefore(currentTime)) {
          return false
        }

        // 開催中: 開始日が現在以前で、終了日がないか終了日が現在以降
        const isOngoing = startDate.isBefore(currentTime) && (!endDate || endDate.isAfter(currentTime))
        // 開催予定: 開始日が現在以降
        const isUpcoming = startDate.isAfter(currentTime)
        // 終了後1週間以内: 終了日があり、終了日から1週間以内
        const isRecentlyEnded = endDate?.isBefore(currentTime) && endDate.add(7, 'day').isAfter(currentTime)

        return isOngoing || isUpcoming || isRecentlyEnded
      })
      .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
  }, [events, categoryFilter, regionFilter, storePrefectureMap])

  if (isLoading) {
    return <LoadingFallback />
  }

  return (
    <div className='mx-auto p-4 md:p-8 space-y-4 max-w-6xl'>
      {/* ヘッダー */}
      <div className='flex items-center justify-between'>
        <div>
          <div className='flex items-center gap-2 mb-2'>
            <Gift className='size-5 text-[#e50012]' />
            <h1 className='text-xl font-bold text-gray-800'>イベント一覧</h1>
          </div>
          <p className='text-sm text-gray-600'>開催中・開催予定のイベント</p>
        </div>
        <Link
          to='/admin/events'
          className='flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors'
        >
          <Settings className='size-4' />
          <span>管理</span>
        </Link>
      </div>

      {/* カテゴリフィルター */}
      <div className='w-full'>
        <div className='flex items-center gap-2 mb-3'>
          <Filter className='h-4 w-4 text-gray-600' />
          <span className='text-sm font-medium text-gray-700'>種別で絞り込み</span>
        </div>
        <div className='flex flex-wrap gap-4 text-sm'>
          {(['ackey', 'limited_card', 'other'] as const).map((category) => (
            <div key={category} className='flex items-center gap-2'>
              <Checkbox
                id={`category-${category}`}
                checked={categoryFilter.has(category)}
                onCheckedChange={() => toggleCategory(category)}
                className={CATEGORY_CHECKBOX_COLORS[category]}
              />
              <label htmlFor={`category-${category}`} className='cursor-pointer'>
                {CATEGORY_LABELS[category]}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* 地域フィルター */}
      <RegionFilterControl />

      {/* ガントチャート */}
      {activeEvents.length > 0 ? (
        <EventGanttChart events={activeEvents} />
      ) : (
        <div className='text-center py-12 text-gray-500'>
          <Gift className='size-12 mx-auto mb-4 opacity-30' />
          <p>開催中・開催予定のイベントはありません</p>
        </div>
      )}
    </div>
  )
}

/**
 * イベント一覧ページ
 */
const EventsPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EventsContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/events/')({
  component: EventsPage
})
