import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Suspense } from 'react'
import { AccessGate } from '@/components/admin/access-gate'
import { LoadingFallback } from '@/components/common/loading-fallback'

/**
 * admin配下のレイアウト
 * Cloudflare Accessによる認証を適用
 */
const AdminLayout = () => {
  return (
    <AccessGate>
      <Suspense fallback={<LoadingFallback />}>
        <Outlet />
      </Suspense>
    </AccessGate>
  )
}

export const Route = createFileRoute('/admin')({
  component: AdminLayout
})
