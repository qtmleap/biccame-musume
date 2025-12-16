import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
// import Header from '@/components/common/header'
/**
 * NOTE: Next.jsでいうところのsrc/app/layout.tsx
 */
export const Route = createRootRoute({
  component: () => (
    <div className='min-h-screen flex flex-col'>
      {/* <ScrollRestoration /> */}
      {/* <Header className='' /> */}
      <main className='flex-1'>
        <Outlet />
      </main>
      {/* <Footer /> */}
      <TanStackRouterDevtools position='bottom-right' />
    </div>
  )
})
