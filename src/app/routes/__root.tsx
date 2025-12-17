import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Footer } from '@/components/common/footer'
import Header from '@/components/common/header'

/**
 * NOTE: Next.jsでいうところのsrc/app/layout.tsx
 */
export const Route = createRootRoute({
  component: () => (
    <div className='min-h-screen flex flex-col bg-pink-50 select-none'>
      <Header />
      <main className='flex-1'>
        <Outlet />
      </main>
      <Footer />
      <TanStackRouterDevtools position='bottom-right' />
    </div>
  )
})
