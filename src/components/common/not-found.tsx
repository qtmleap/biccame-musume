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
            <h1 className='text-8xl md:text-9xl font-bold text-brand mb-4'>404</h1>
            <h2 className='text-2xl md:text-3xl font-bold text-foreground mb-4'>ページが見つかりませんでした</h2>
            <p className='text-muted-foreground text-lg'>お探しのページは存在しないか、移動した可能性があります。</p>
          </div>

          {/* アクション */}
          <div className='flex flex-col sm:flex-row gap-4 justify-center items-center pt-8'>
            <Button asChild size='lg' className='bg-brand hover:bg-brand/90 text-brand-foreground'>
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
          <div className='pt-12 border-t border-card'>
            <h3 className='text-lg font-bold text-foreground mb-4'>よくアクセスされるページ</h3>
            <ul className='space-y-2 text-muted-foreground'>
              <li>
                <Link to='/characters' className='text-brand hover:underline'>
                  ビッカメ娘一覧
                </Link>
              </li>
              <li>
                <Link to='/calendar' className='text-brand hover:underline'>
                  カレンダー
                </Link>
              </li>
              <li>
                <Link to='/location' className='text-brand hover:underline'>
                  マップ
                </Link>
              </li>
              <li>
                <Link to='/ranking' className='text-brand hover:underline'>
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
