import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { AuthProvider } from '@/components/auth/auth-provider'
import { ErrorFallback } from '@/components/common/error-fallback'
import { Footer } from '@/components/common/footer'
import { Header } from '@/components/common/header'
import { NotFound } from '@/components/common/not-found'
import { TooltipProvider } from '@/components/ui/tooltip'

const RootComponent = () => {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        <div className='min-h-screen grid grid-rows-[auto_1fr_auto] select-none'>
          <Header />
          <main className='min-h-0'>
            <Outlet />
          </main>
          <Footer />
          <TanStackRouterDevtools position='bottom-right' />
        </div>
      </TooltipProvider>
    </AuthProvider>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorFallback
})
