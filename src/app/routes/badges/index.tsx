import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { BadgeGrid } from '@/components/badges/badge-grid'
import { BadgeLeaderboard } from '@/components/badges/badge-leaderboard'
import { BadgeSummary } from '@/components/badges/badge-summary'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useBadgeLeaderboard } from '@/hooks/use-badge-leaderboard'
import { useBadges } from '@/hooks/use-badges'
import { auth } from '@/lib/firebase'
import { DURATION } from '@/lib/motion'

const BadgesContent = () => {
  const { user } = useAuth()
  const router = useRouter()

  const { badges, earnedMap } = useBadges()
  const { data: leaderboard } = useBadgeLeaderboard(user?.uid)

  const earnedCount = earnedMap.size
  const totalCount = badges.length
  const myRank = leaderboard.me?.rank ?? leaderboard.top.length + 1
  const totalUsers = leaderboard.top.length

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-5xl'>
        <div className='pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
            onClick={() => router.history.back()}
          >
            <ArrowLeft className='h-4 w-4 mr-1' />
            戻る
          </Button>
        </div>

        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-4 text-center relative'
        >
          <div className='inline-flex items-center gap-1.5 text-[10px] md:text-xs font-bold tracking-widest text-rank-gold bg-rank-gold/10 px-3 py-1 rounded-full'>
            <Sparkles className='size-3' />
            11TH ANNIVERSARY
          </div>
          <h1 className='mt-2 font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight'>
            バッジコレクション
          </h1>
          <p className='mt-1 text-xs md:text-sm text-muted-foreground'>集めて、自慢して、コンプを目指そう</p>
        </motion.header>

        <BadgeSummary
          user={user}
          earnedCount={earnedCount}
          totalCount={totalCount}
          myRank={myRank}
          totalUsers={totalUsers}
        />

        <div className='mt-6 md:mt-8'>
          <BadgeGrid badges={badges} earnedMap={earnedMap} />
        </div>

        <div className='mt-8 md:mt-10'>
          <BadgeLeaderboard leaderboard={leaderboard} totalBadges={totalCount} myUid={user?.uid} />
        </div>

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
