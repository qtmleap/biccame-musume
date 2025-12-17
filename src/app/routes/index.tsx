import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Calendar, MapPin, Users } from 'lucide-react'

/**
 * トップページ
 */
const RouteComponent = () => {
  const features = [
    {
      icon: Calendar,
      title: '誕生日カレンダー',
      description: 'キャラクター・店舗の誕生日やイベントを見逃さない',
      link: '/calendar',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: MapPin,
      title: '店舗マップ',
      description: '全国のビックカメラを効率よく巡る',
      link: '/location',
      color: 'from-emerald-500 to-teal-500'
    },
    {
      icon: Users,
      title: 'キャラクター一覧',
      description: 'ビッカメ娘のプロフィールを確認',
      link: '/characters',
      color: 'from-pink-500 to-rose-500'
    }
  ]

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='container mx-auto px-4 py-8 md:py-12'>
        {/* ヘッダー */}
        <header className='text-center mb-8'>
          <h1 className='text-2xl md:text-3xl font-bold text-gray-800 mb-2'>
            イベントを逃さない。全国を回りやすく。
          </h1>
          <p className='text-gray-600 text-sm md:text-base'>
            ビッカメ娘のイベント追跡と店舗巡り支援ツール
          </p>
        </header>

        {/* メインコンテンツ */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto'>
          {features.map((feature) => (
            <Link key={feature.title} to={feature.link}>
              <div className='group bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer h-full border border-gray-100'>
                <div className={`inline-flex p-2.5 rounded-lg bg-gradient-to-br ${feature.color} mb-3`}>
                  <feature.icon className='h-5 w-5 text-white' />
                </div>

                <h2 className='text-base font-bold text-gray-800 mb-1.5 group-hover:text-[#e50012] transition-colors'>
                  {feature.title}
                </h2>

                <p className='text-gray-500 text-sm mb-2'>
                  {feature.description}
                </p>

                <div className='flex items-center text-[#e50012] font-medium text-xs'>
                  <span>開く</span>
                  <ArrowRight className='h-3 w-3 ml-0.5 group-hover:translate-x-0.5 transition-transform' />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: RouteComponent
})

