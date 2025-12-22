import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Footer } from '@/components/common/footer'
import Header from '@/components/common/header'

/**
 * 404ページコンポーネント
 */
const NotFoundComponent = () => (
  <div className='container mx-auto px-4 py-8 text-center'>
    <h1 className='text-4xl font-bold text-gray-800 mb-4'>404</h1>
    <p className='text-xl text-gray-600 mb-8'>ページが見つかりませんでした</p>
    <a href='/' className='text-pink-600 hover:text-pink-700 underline'>
      トップページに戻る
    </a>
  </div>
)

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
  ),
  notFoundComponent: NotFoundComponent
})
