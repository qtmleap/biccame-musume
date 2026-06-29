import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useMemo, useState } from 'react'
import { CATEGORY_ORDER } from '@/components/admin/badges/badge-display-constants'
import { CategorySection } from '@/components/admin/badges/category-section'
import { CreateBadgeDialog } from '@/components/admin/badges/create-badge-dialog'
import { RecalculateBadgesButton } from '@/components/admin/badges/recalculate-badges-button'
import { StatCard } from '@/components/admin/badges/stat-card'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { useAllBadges } from '@/hooks/use-admin-badges'
import { DURATION } from '@/lib/motion'
import type { Badge as BadgeDto } from '@/schemas/badge.dto'

const BadgesContent = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const { data } = useAllBadges()
  const badges = data.badges

  const totalCount = badges.length
  const hiddenCount = badges.filter((b) => b.is_hidden).length
  const visibleCount = totalCount - hiddenCount
  const specialCount = badges.filter((b) => b.category === 'special').length
  const totalEarned = badges.reduce((s, b) => s + (b.earned_count ?? 0), 0)

  const grouped = useMemo(() => {
    return badges.reduce<Record<string, BadgeDto[]>>((acc, badge) => {
      const cat = badge.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(badge)
      return acc
    }, {})
  }, [badges])

  const totalsByCategory = useMemo(() => {
    return badges.reduce<Record<string, number>>((acc, badge) => {
      acc[badge.category] = (acc[badge.category] ?? 0) + 1
      return acc
    }, {})
  }, [badges])

  return (
    <div className='min-h-screen bg-page-bg'>
      <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
        <div className='pb-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground -ml-2 border border-transparent'
            asChild
          >
            <Link to='/admin'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              管理画面に戻る
            </Link>
          </Button>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-4 md:mb-6'
        >
          <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4'>
            <div className='min-w-0'>
              <h1 className='text-2xl font-bold text-foreground'>バッジ管理</h1>
              <p className='mt-2 text-sm text-muted-foreground md:text-base'>
                特別バッジの作成・編集と表示設定。自動生成バッジは表示フィールドのみ編集可。
              </p>
            </div>
            <div className='flex items-center gap-2 shrink-0'>
              <RecalculateBadgesButton />
              <Button
                size='sm'
                className='bg-brand hover:bg-brand/90 text-brand-foreground'
                onClick={() => setCreateOpen(true)}
              >
                <Plus className='size-4 mr-1' />
                特別バッジ作成
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal, delay: 0.06 }}
          className='grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3 mb-5 md:mb-6'
        >
          <StatCard label='総バッジ' value={totalCount} accent='text-foreground' />
          <StatCard label='表示中' value={visibleCount} accent='text-brand' />
          <StatCard label='非表示' value={hiddenCount} accent='text-muted-foreground' />
          <StatCard label='特別' value={specialCount} accent='text-rank-gold' />
          <StatCard label='総獲得数' value={totalEarned} accent='text-favorite' />
        </motion.div>

        {/* Badge list */}
        <div className='space-y-8'>
          {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
            <CategorySection
              key={cat}
              categoryKey={cat}
              badges={grouped[cat]}
              totalInCategory={totalsByCategory[cat] ?? 0}
            />
          ))}
        </div>

        <CreateBadgeDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    </div>
  )
}

const BadgesPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BadgesContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/badges/')({
  component: BadgesPage
})
