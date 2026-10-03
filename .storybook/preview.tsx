import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import 'dayjs/locale/ja'
import type { Preview } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import MockDate from 'mockdate'
import { MotionConfig } from 'motion/react'
import { type ReactNode, Suspense, useEffect, useMemo } from 'react'
import { AuthProvider } from '../src/components/auth/auth-provider'
import { ErrorBoundary } from '../src/components/common/error-boundary'
import { LoadingFallback } from '../src/components/common/loading-fallback'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { installNetworkBoundary } from './catalogue/network'
import { configureFixture, type FixtureOptions, runtime } from './catalogue/runtime'
import { resetClientFixture } from './mocks/client'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/zen-maru-gothic/400.css'
import '@fontsource/zen-maru-gothic/500.css'
import '@fontsource/zen-maru-gothic/700.css'
import '@fontsource/m-plus-1-code/400.css'
import '@fontsource/m-plus-1-code/500.css'
import '@fontsource/m-plus-1-code/700.css'
import '../src/index.css'

dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('ja')
MockDate.set('2026-10-02T03:00:00.000Z')
Math.random = () => 0.5
installNetworkBoundary()
Object.assign(window, { __storybookFixture: runtime })

function PreviewFrame({
  children,
  theme,
  fixture,
  storyId
}: {
  children: ReactNode
  theme: string
  fixture: FixtureOptions
  storyId: string
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = 'ja'
  }, [theme])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Scenario values reset the fixture; parameter object identity can change during Storybook resizing without changing the scenario.
  const queryClient = useMemo(() => {
    configureFixture(fixture)
    resetClientFixture()
    return new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
        mutations: { retry: false }
      }
    })
  }, [storyId, fixture.state, fixture.authenticated, fixture.access])
  const router = useMemo(
    () =>
      createRouter({
        routeTree: createRootRoute({ component: () => <>{children}</> }),
        history: createMemoryHistory({ initialEntries: ['/'] })
      }),
    [children]
  )
  return (
    <Provider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MotionConfig reducedMotion='always'>
            <TooltipProvider>
              <div
                data-testid='review-frame'
                data-catalogue-story={storyId}
                className='min-h-screen bg-page-bg p-4 text-foreground md:p-8'
              >
                <ErrorBoundary>
                  <Suspense fallback={<LoadingFallback />}>
                    <RouterProvider router={router} />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </TooltipProvider>
          </MotionConfig>
        </AuthProvider>
      </QueryClientProvider>
    </Provider>
  )
}

const widths = [320, 375, 430, 768, 1024, 1280, 1440]
const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: Object.fromEntries(
        widths.map((width) => [
          String(width),
          {
            name: `${width}px`,
            styles: { width: `${width}px`, height: width < 768 ? '812px' : '900px' },
            type: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
          }
        ])
      )
    },
    docs: {
      story: { inline: false },
      description: { component: '2026-10-02固定データ。実コンポーネントと改善案モックを区別して表示します。' }
    }
  },
  globalTypes: {
    theme: {
      description: 'テーマ',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'ライト' },
          { value: 'dark', title: 'ダーク' }
        ],
        dynamicTitle: true
      }
    }
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    (Story, context) => (
      <PreviewFrame
        key={context.id}
        theme={context.globals.theme}
        storyId={context.id}
        fixture={context.parameters.fixture ?? { authenticated: !context.title.startsWith('Review/') }}
      >
        <Story />
      </PreviewFrame>
    )
  ]
}
export default preview
