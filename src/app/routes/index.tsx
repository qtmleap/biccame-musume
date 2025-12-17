import { createFileRoute, Link } from '@tanstack/react-router'
import { Calendar, Map, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * トップページ - ビッカメ娘非公式ファンサイト
 */
const RouteComponent = () => {
  return (
    <div className='min-h-screen bg-gradient-to-b from-blue-50 to-white'>
      <div className='container mx-auto px-4 py-12 md:py-16 lg:py-20'>
        {/* ヘッダー */}
        <header className='text-center mb-12 md:mb-16 lg:mb-20'>
          <h1 className='text-5xl md:text-6xl lg:text-7xl font-bold mb-4 md:mb-6 text-[#e50012]'>
            ビッカメ娘
          </h1>
          <p className='text-2xl md:text-3xl lg:text-4xl font-semibold text-gray-700 mb-3 md:mb-4'>
            非公式ファンサイト
          </p>
          <p className='text-gray-600 text-base md:text-lg lg:text-xl max-w-3xl mx-auto px-4'>
            ビックカメラの店舗擬人化キャラクター「ビッカメ娘」を応援する非公式ファンサイトです
          </p>
        </header>

        {/* メインコンテンツ */}
        <div className='max-w-5xl mx-auto'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8'>
            {/* キャラクター一覧 */}
            <Card className='hover:shadow-xl transition-all hover:-translate-y-1'>
              <CardHeader>
                <div className='flex flex-col items-center text-center gap-3'>
                  <Users className='h-12 w-12 md:h-14 md:w-14 text-[#e50012]' />
                  <CardTitle className='text-xl md:text-2xl'>キャラクター一覧</CardTitle>
                </div>
                <CardDescription className='text-sm md:text-base text-center'>
                  全国のビックカメラ店舗を擬人化したキャラクターを紹介
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to='/characters'>
                  <Button className='w-full bg-[#e50012] hover:bg-[#cc0010] text-white text-base md:text-lg py-5 md:py-6'>
                    一覧を見る
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* カレンダー */}
            <Card className='hover:shadow-xl transition-all hover:-translate-y-1'>
              <CardHeader>
                <div className='flex flex-col items-center text-center gap-3'>
                  <Calendar className='h-12 w-12 md:h-14 md:w-14 text-[#e50012]' />
                  <CardTitle className='text-xl md:text-2xl'>誕生日カレンダー</CardTitle>
                </div>
                <CardDescription className='text-sm md:text-base text-center'>
                  キャラクターと店舗の誕生日をカレンダーで確認
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to='/calendar'>
                  <Button className='w-full bg-[#e50012] hover:bg-[#cc0010] text-white text-base md:text-lg py-5 md:py-6'>
                    カレンダーを見る
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* ロケーション */}
            <Card className='hover:shadow-xl transition-all hover:-translate-y-1'>
              <CardHeader>
                <div className='flex flex-col items-center text-center gap-3'>
                  <Map className='h-12 w-12 md:h-14 md:w-14 text-[#e50012]' />
                  <CardTitle className='text-xl md:text-2xl'>店舗マップ</CardTitle>
                </div>
                <CardDescription className='text-sm md:text-base text-center'>
                  地図上で店舗の場所を確認
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to='/location'>
                  <Button className='w-full bg-[#e50012] hover:bg-[#cc0010] text-white text-base md:text-lg py-5 md:py-6'>
                    マップを見る
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: RouteComponent
})
