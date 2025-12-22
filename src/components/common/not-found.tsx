import { Link } from '@tanstack/react-router'
import { Home, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 404 Not Foundコンポーネント
 */
export const NotFound = () => {
  return (
    <div className='min-h-screen bg-linear-to-b from-blue-50 to-white'>
      <div className='container mx-auto px-4 py-12'>
        <div className='max-w-2xl mx-auto text-center space-y-8'>
          {/* エラーコード */}
          <div>
            <h1 className='text-8xl md:text-9xl font-bold text-[#e50012] mb-4'>404</h1>
            <h2 className='text-2xl md:text-3xl font-bold text-gray-800 mb-4'>ページが見つかりませんでした</h2>
            <p className='text-gray-600 text-lg'>お探しのページは存在しないか、移動した可能性があります。</p>
          </div>

          {/* アクション */}
          <div className='flex flex-col sm:flex-row gap-4 justify-center items-center pt-8'>
            <Button asChild size='lg' className='bg-[#e50012] hover:bg-[#c4000f]'>
              <Link to='/'>
                <Home className='mr-2 h-5 w-5' />
                トップページに戻る
              </Link>
            </Button>
            <Button asChild variant='outline' size='lg'>
              <Link to='/characters'>
                <Search className='mr-2 h-5 w-5' />
                ビッカメ娘一覧を見る
              </Link>
            </Button>
          </div>

          {/* 補足情報 */}
          <div className='pt-12 border-t border-gray-200'>
            <h3 className='text-lg font-bold text-gray-800 mb-4'>よくアクセスされるページ</h3>
            <ul className='space-y-2 text-gray-700'>
              <li>
                <Link to='/characters' className='text-[#e50012] hover:underline'>
                  ビッカメ娘一覧
                </Link>
              </li>
              <li>
                <Link to='/calendar' className='text-[#e50012] hover:underline'>
                  カレンダー
                </Link>
              </li>
              <li>
                <Link to='/location' className='text-[#e50012] hover:underline'>
                  マップ
                </Link>
              </li>
              <li>
                <Link to='/ranking' className='text-[#e50012] hover:underline'>
                  総選挙
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
