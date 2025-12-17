import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Cake, Calendar, Sticker, Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useEffect, useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
   * Xウィジェットスクリプトを読み込む
   */
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.charset = 'utf-8'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

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
        <div className='container mx-auto px-4 text-center max-w-4xl'>
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

                        {event.character.profile_image_url && (
                          <Avatar className='w-8 h-8'>
                            <AvatarImage
                              src={event.character.profile_image_url}
                              alt={event.character.character_name}
                              className='object-cover object-top'
                            />
                            <AvatarFallback>{event.character.character_name.charAt(0)}</AvatarFallback>
                          </Avatar>
                        )}

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

            {upcomingEvents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
                className='mt-4 text-right'
              >
                <Link
                  to='/calendar'
                  className='text-sm text-gray-700 hover:text-gray-900 font-semibold hover:underline transition-colors'
                >
                  今後のイベント一覧
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* LINEスタンプ宣伝 */}
      <section className='py-6 md:py-8 bg-linear-to-br from-blue-50 to-indigo-50'>
        <div className='container mx-auto px-4'>
          <div className='max-w-2xl mx-auto'>
            <div className='flex items-center gap-2 mb-4'>
              <Sticker className='h-5 w-5 text-blue-600' />
              <h2 className='text-base font-bold text-gray-800'>LINEスタンプ</h2>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              {/* スタンプ1 */}
              <motion.a
                href='https://store.line.me/stickershop/product/1391834/ja'
                target='_blank'
                rel='noopener noreferrer'
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className='block'
              >
                <div className='bg-white rounded-lg p-4 shadow-sm border-2 border-blue-200 hover:border-blue-400 transition-all h-full'>
                  <div className='flex items-start gap-3'>
                    <div className='bg-linear-to-br from-blue-500 to-indigo-600 p-2.5 rounded-full shrink-0'>
                      <svg className='w-5 h-5 text-white' viewBox='0 0 24 24' fill='currentColor' aria-label='LINE'>
                        <title>LINE</title>
                        <path d='M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.771.039 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314' />
                      </svg>
                    </div>
                    <div className='flex-1 min-w-0'>
                      <h3 className='text-sm font-bold text-gray-900 mb-0.5'>ビッカメ娘</h3>
                      <p className='text-xs text-gray-600 leading-tight'>オリジナルスタンプ</p>
                    </div>
                  </div>
                </div>
              </motion.a>

              {/* スタンプ2 */}
              <motion.a
                href='https://store.line.me/stickershop/product/4137675/ja'
                target='_blank'
                rel='noopener noreferrer'
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className='block'
              >
                <div className='bg-white rounded-lg p-4 shadow-sm border-2 border-blue-200 hover:border-blue-400 transition-all h-full'>
                  <div className='flex items-start gap-3'>
                    <div className='bg-linear-to-br from-blue-500 to-indigo-600 p-2.5 rounded-full shrink-0'>
                      <svg className='w-5 h-5 text-white' viewBox='0 0 24 24' fill='currentColor' aria-label='LINE'>
                        <title>LINE</title>
                        <path d='M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.771.039 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314' />
                      </svg>
                    </div>
                    <div className='flex-1 min-w-0'>
                      <h3 className='text-sm font-bold text-gray-900 mb-0.5'>ビッカメ娘 第2弾</h3>
                      <p className='text-xs text-gray-600 leading-tight'>日常会話スタンプ</p>
                    </div>
                  </div>
                </div>
              </motion.a>
            </div>
          </div>
        </div>
      </section>

      {/* Xポストボタン */}
      <section className='py-6 bg-amber-50'>
        <div className='container mx-auto px-4'>
          <div className='max-w-2xl mx-auto text-center'>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className='flex flex-col items-center gap-2'
            >
              <p className='text-sm text-gray-600'>このサイトをシェア</p>
              <a
                href='https://twitter.com/share?ref_src=twsrc%5Etfw'
                className='twitter-share-button'
                data-show-count='false'
                data-lang='ja'
                data-hashtags='ビッカメ娘'
                data-text='ビッカメ娘応援プロジェクト'
              >
                Tweet
              </a>
            </motion.div>
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
