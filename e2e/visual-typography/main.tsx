import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Provider } from 'jotai'
import { MotionConfig } from 'motion/react'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarEventList } from '@/components/calendar/calendar-event-list'
import {
  StoreAccess,
  StoreAddress,
  StoreBirthday,
  StoreHours,
  StoreName,
  StorePhone
} from '@/components/characters/detail/store-info-items'
import { PaginatedEventGrid } from '@/components/events/paginated-event-grid'
import { EventList } from '@/components/home/event-list'
import { HomeHeader } from '@/components/home/home-header'
import { StoreDataSchema } from '@/schemas/store.dto'
import { events } from './fixtures'
import '@/index.css'

const character = StoreDataSchema.parse({
  id: 'nagoyagate',
  prefecture: '愛知県',
  character: { name: 'なごやげーとたん', description: '撮影用の合成データ', images: ['missing.webp'] },
  store: { name: '名古屋JRゲートタワー店', access: [] }
})
const Gallery = () => (
  <Suspense fallback={<p>読み込み中</p>}>
    <HomeHeader />
    <div data-section='home'>
      <EventList />
    </div>
    <section data-section='grid' className='mx-auto max-w-6xl px-4 md:px-8 py-4'>
      <h2 className='text-lg font-bold text-foreground mb-3'>イベント一覧</h2>
      <PaginatedEventGrid events={events} page={1} onPageChange={() => {}} />
    </section>
    <section data-section='calendar' className='mx-auto max-w-6xl px-4 md:px-8 py-4'>
      <h2 className='text-lg font-bold text-foreground mb-3'>10月の記念日</h2>
      <CalendarEventList year={2026} month={10} events={[{ date: '2026-10-04', character, type: 'store', years: 9 }]} />
    </section>
    <section data-section='store' className='mx-auto max-w-4xl px-4 py-4 space-y-4'>
      <h2 className='text-lg font-bold text-foreground'>店舗情報</h2>
      <StoreName name='名古屋JRゲートタワー店' storeId={1} />
      <StoreAddress address='愛知県名古屋市中村区名駅一丁目' postalCode='450-0002' />
      <StorePhone phone='052-000-0000' />
      <StoreHours hours={[{ type: 'all', open_time: '10:00', close_time: '21:00' }]} openAllYear />
      <StoreAccess access={[{ station: '名古屋駅', description: '駅から徒歩3分', lines: ['JR線', '地下鉄東山線'] }]} />
      <StoreBirthday birthday='2017-04-07' />
    </section>
  </Suspense>
)
const root = createRootRoute({ component: Gallery })
const destinations = ['/events', '/events/$uuid', '/characters', '/location', '/characters/$id'].map((path) =>
  createRoute({ path, getParentRoute: () => root, component: () => null })
)
const router = createRouter({
  routeTree: root.addChildren(destinations),
  history: createMemoryHistory({ initialEntries: ['/events'] })
})
const container = document.getElementById('root')
if (!container) throw new Error('Missing test root')
createRoot(container).render(
  <Provider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MotionConfig reducedMotion='always'>
        <RouterProvider router={router} />
      </MotionConfig>
    </QueryClientProvider>
  </Provider>
)
