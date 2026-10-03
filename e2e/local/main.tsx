import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import { routeTree } from '@/app/routeTree.gen'
import './styles.css'

document.documentElement.classList.toggle(
  'dark',
  (new URLSearchParams(location.search).get('theme') || localStorage.getItem('theme')) === 'dark'
)
const router = createRouter({ routeTree })
const root = document.getElementById('root')
if (!root) throw new Error('Missing app root')
createRoot(root).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MotionConfig skipAnimations reducedMotion='always'>
      <RouterProvider router={router} />
    </MotionConfig>
  </QueryClientProvider>
)
