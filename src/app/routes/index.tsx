import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Cake, Calendar, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useMemo } from 'react'
import { useCharacters } from '@/hooks/useCharacters'
import type { Character } from '@/schemas/character.dto'

type UpcomingEvent = {
  character: Character
  type: 'character' | 'store'
  date: dayjs.Dayjs
  daysUntil: number
}

/**
 * ローディングフォールバック
 */
const LoadingFallback = () => (
  <div>
    <header className='bg-linear-to-r from-[#e50012] to-[#ff3333] py-10 md:py-12'>
      <div className='container mx-auto px-4 text-center'>
        <h1 className='text-xl md:text-2xl font-bold text-white mb-2 whitespace-nowrap'>
          <span className='hidden md:inline'>イベントを逃さない。全国を回りやすく。</span>
          <span className='md:hidden'>
            イベントを逃さない。
            <br />
            全国を回りやすく。
          </span>
        </h1>
        <p className='text-white/80 text-xs md:text-sm'>ビッカメ娘のイベント追跡と店舗巡り支援サイト</p>
      </div>
    </header>
    <section className='py-6 md:py-8'>
      <div className='container mx-auto px-4'>
        <div className='max-w-2xl mx-auto'>
          <div className='flex items-center gap-2 mb-4'>
            <Calendar className='h-5 w-5 text-[#e50012]' />
            <h2 className='text-base font-bold text-gray-800'>直近のイベント</h2>
          </div>
          <div className='text-center py-4 text-gray-500 text-sm'>読み込み中...</div>
        </div>
      </div>
    </section>
  </div>
)

/**
 * トップページコンテンツ
 */
const HomeContent = () => {
  const { data: characters } = useCharacters()

  /**
   * 直近のイベントを計算
   */
  const upcomingEvents = useMemo(() => {
    const now = dayjs()
    const events: UpcomingEvent[] = []

    for (const character of characters) {
      if (character.character_birthday) {
        const birthday = dayjs(character.character_birthday)
        if (birthday.isValid()) {
          const thisYear = now.year()
          let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())
          if (nextBirthday.isBefore(now, 'day')) {
            nextBirthday = nextBirthday.add(1, 'year')
          }
          const daysUntil = nextBirthday.diff(now, 'day')
          events.push({ character, type: 'character', date: nextBirthday, daysUntil })
        }
      }

      if (character.store_birthday) {
        const birthday = dayjs(character.store_birthday)
        if (birthday.isValid()) {
          const thisYear = now.year()
          let nextBirthday = dayjs().year(thisYear).month(birthday.month()).date(birthday.date())
          if (nextBirthday.isBefore(now, 'day')) {
            nextBirthday = nextBirthday.add(1, 'year')
          }
          const daysUntil = nextBirthday.diff(now, 'day')
          events.push({ character, type: 'store', date: nextBirthday, daysUntil })
        }
      }
    }

    events.sort((a, b) => a.daysUntil - b.daysUntil)
    return events.slice(0, 5)
  }, [characters])

  /**
   * 日数に応じたラベルを返す
   */
  const getDaysLabel = (days: number) => {
    if (days === 0) return '今日'
    if (days === 1) return '明日'
    return `${days}日後`
  }

  return (
    <div>
      {/* ヘッダー */}
      <header className='bg-linear-to-r from-[#e50012] to-[#ff3333] py-10 md:py-12'>
        <div className='container mx-auto px-4 text-center'>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className='text-xl md:text-2xl font-bold text-white mb-2 whitespace-nowrap'
          >
            <span className='hidden md:inline'>イベントを逃さない。全国を回りやすく。</span>
            <span className='md:hidden'>
              イベントを逃さない。
              <br />
              全国を回りやすく。
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
            className='text-white/80 text-xs md:text-sm'
          >
            ビッカメ娘のイベント追跡と店舗巡り支援サイト
          </motion.p>
        </div>
      </header>

      {/* 直近のイベント */}
      <section className='py-6 md:py-8'>
        <div className='container mx-auto px-4'>
          <div className='max-w-2xl mx-auto'>
            <div className='flex items-center gap-2 mb-4'>
              <Calendar className='h-5 w-5 text-[#e50012]' />
              <h2 className='text-base font-bold text-gray-800'>直近のイベント</h2>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className='text-center py-4 text-gray-500 text-sm'>イベントがありません</div>
            ) : (
              <div className='flex flex-col gap-2'>
                {upcomingEvents.map((event, index) => (
                  <motion.div
                    key={`${event.character.key}-${event.type}-${index}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: index * 0.1,
                      ease: 'easeOut'
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Link to='/characters/$id' params={{ id: event.character.key }}>
                      <div className='flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:border-[#e50012]/30 transition-colors cursor-pointer'>
                        <div
                          className={`p-2 rounded-lg ${event.type === 'character' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}
                        >
                          {event.type === 'character' ? <Cake className='h-4 w-4' /> : <Store className='h-4 w-4' />}
                        </div>

                        <div className='flex-1 min-w-0'>
                          <p className='text-sm font-medium text-gray-800 truncate'>
                            {event.character.character_name}
                            <span className='text-gray-400 font-normal ml-1'>
                              {event.type === 'character' ? 'の誕生日' : '(店舗誕生日)'}
                            </span>
                          </p>
                          <p className='text-xs text-gray-500'>{event.date.format('M月D日')}</p>
                        </div>

                        <div
                          className={`text-xs font-bold px-2 py-1 rounded ${
                            event.daysUntil === 0
                              ? 'bg-[#e50012] text-white'
                              : event.daysUntil <= 7
                                ? 'bg-orange-100 text-orange-600'
                                : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {getDaysLabel(event.daysUntil)}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * ルートコンポーネント
 */
const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <HomeContent />
  </Suspense>
)

export const Route = createFileRoute('/')({
  component: RouteComponent
})
