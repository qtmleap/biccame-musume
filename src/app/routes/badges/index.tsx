import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { BadgeGrid } from '@/components/badges/badge-grid'
import { AppBreadcrumb } from '@/components/common/breadcrumb'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useBadges } from '@/hooks/use-badges'
import { auth } from '@/lib/firebase'
import { DURATION } from '@/lib/motion'

const BadgesContent = () => {
  const { badges, earnedMap } = useBadges()
  const earnedCount = earnedMap.size

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <AppBreadcrumb
          items={[{ label: 'ホーム', to: '/' }, { label: 'マイページ', to: '/me' }, { label: 'バッジコレクション' }]}
        />
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-6 md:mb-8'
        >
          <h1 className='text-2xl font-bold text-foreground mb-4'>バッジコレクション</h1>
          <div
            className='font-numeric font-black tabular-nums text-rank-gold leading-none text-5xl md:text-6xl'
            style={{ letterSpacing: '-0.06em' }}
          >
            {earnedCount}
            <span className='ml-1 text-xl md:text-2xl text-muted-foreground'>個</span>
          </div>
        </motion.header>

        <BadgeGrid badges={badges} earnedMap={earnedMap} />

        <div className='mt-8 mb-6 text-center'>
          <p className='text-xs text-muted-foreground mb-3'>もっと集めるには？</p>
          <div className='flex justify-center gap-2 flex-wrap'>
            <Button asChild variant='outline' size='sm' className='rounded-full'>
              <Link to='/characters'>キャラ一覧で投票</Link>
            </Button>
            <Button asChild variant='outline' size='sm' className='rounded-full'>
              <Link to='/events'>イベントを探す</Link>
            </Button>
            <Button asChild variant='outline' size='sm' className='rounded-full'>
              <Link to='/location'>店舗を訪問</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const RouteComponent = () => (
  <Suspense fallback={<LoadingFallback />}>
    <BadgesContent />
  </Suspense>
)

export const Route = createFileRoute('/badges/')({
  component: RouteComponent,
  beforeLoad: async () => {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe()
        if (!user) {
          throw new Error('Unauthorized')
        }
        resolve(undefined)
      })
    })
  },
  onError: ({ error, navigate }) => {
    if (error.message === 'Unauthorized') {
      navigate({ to: '/' })
    }
  }
})
