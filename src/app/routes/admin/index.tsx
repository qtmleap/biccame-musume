import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Award, Calendar, MessageSquare } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { Button } from '@/components/ui/button'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { ADMIN_LABELS } from '@/locales/app.content'

const MENU_ITEMS = [
  {
    to: '/admin/events',
    icon: Calendar,
    title: ADMIN_LABELS.eventManagement,
    description: ADMIN_LABELS.eventManagementDesc,
    iconBg: 'bg-rank-gold/15',
    iconText: 'text-rank-gold'
  },
  {
    to: '/admin/badges',
    icon: Award,
    title: ADMIN_LABELS.badgeManagement,
    description: ADMIN_LABELS.badgeManagementDesc,
    iconBg: 'bg-favorite/15',
    iconText: 'text-favorite'
  },
  {
    to: '/admin/comments',
    icon: MessageSquare,
    title: ADMIN_LABELS.commentManagement,
    description: ADMIN_LABELS.commentManagementDesc,
    iconBg: 'bg-brand/15',
    iconText: 'text-brand'
  }
] as const

const MenuCard = ({
  to,
  icon: Icon,
  title,
  description,
  iconBg,
  iconText,
  index
}: {
  to: string
  icon: React.ElementType
  title: string
  description: string
  iconBg: string
  iconText: string
  index: number
}) => {
  const rotation = getStickerRotation(index)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay: index * 0.08 }}
      style={{ filter: STICKER_SHADOW_SM }}
    >
      <motion.div
        style={{ rotate: rotation }}
        whileHover={{ scale: 1.02, rotate: 0 }}
        whileTap={{ scale: 0.98 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <Link
          to={to}
          className='block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl'
        >
          <div className='bg-card border border-card-border rounded-2xl p-5 md:p-6 flex items-center gap-4'>
            <div
              className={`flex size-12 shrink-0 items-center justify-center rounded-xl md:size-14 ${iconBg} ${iconText}`}
            >
              <Icon className='size-6 md:size-7' />
            </div>
            <div className='flex-1 min-w-0'>
              <h3 className='font-bold text-base md:text-lg text-foreground truncate'>{title}</h3>
              <p className='mt-0.5 text-sm text-muted-foreground'>{description}</p>
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  )
}

const AdminContent = () => {
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
            <Link to='/'>
              <ArrowLeft className='h-4 w-4 mr-1' />
              サイトに戻る
            </Link>
          </Button>
        </div>

        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.normal }}
          className='mb-6 md:mb-8'
        >
          <h1 className='font-display font-bold text-2xl md:text-3xl text-foreground tracking-tight'>管理画面</h1>
          <p className='mt-1 text-sm text-muted-foreground'>各種管理機能へのアクセス</p>
        </motion.header>

        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5'>
          {MENU_ITEMS.map((item, index) => (
            <MenuCard key={item.to} {...item} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}

const AdminPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminContent />
    </Suspense>
  )
}

export const Route = createFileRoute('/admin/')({
  component: AdminPage
})
