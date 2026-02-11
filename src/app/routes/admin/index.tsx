import { createFileRoute, Link } from '@tanstack/react-router'
import { Calendar, ChevronRight } from 'lucide-react'
import { Suspense } from 'react'
import { LoadingFallback } from '@/components/common/loading-fallback'
import { ADMIN_LABELS } from '@/locales/app.content'

/**
 * 管理メニューアイテム
 */
const MenuCard = ({
  to,
  icon: Icon,
  title,
  description
}: {
  to: string
  icon: React.ElementType
  title: string
  description: string
}) => {
  return (
    <Link to={to}>
      <div className='group rounded-lg border p-4 transition-colors hover:border-primary hover:bg-accent/50 md:p-6'>
        <div className='flex items-center gap-4'>
          <div className='flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary md:size-14'>
            <Icon className='size-6 md:size-7' />
          </div>
          <div className='flex-1'>
            <h3 className='text-lg font-semibold text-gray-900 md:text-xl'>{title}</h3>
            <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
          </div>
          <ChevronRight className='size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1' />
        </div>
      </div>
    </Link>
  )
}

/**
 * 管理画面のコンテンツ
 */
const AdminContent = () => {
  return (
    <div className='mx-auto px-4 py-2 md:py-4 md:px-8 max-w-6xl'>
      {/* ヘッダー */}
      <div className='mb-6 md:mb-8'>
        <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>管理画面</h1>
        <p className='mt-2 text-sm text-gray-600 md:text-base'>各種管理機能へのアクセス</p>
      </div>

      {/* 管理メニュー */}
      <div className='space-y-4'>
        <MenuCard
          to='/admin/events'
          icon={Calendar}
          title={ADMIN_LABELS.eventManagement}
          description={ADMIN_LABELS.eventManagementDesc}
        />
      </div>
    </div>
  )
}

/**
 * 管理画面ページ
 */
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
