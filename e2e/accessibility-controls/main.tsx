import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router'
import { Provider } from 'jotai'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Route as EventsRoute } from '@/app/routes/events/index'
import { CalendarHeader, CalendarMonthDots, CalendarMonthTabs } from '@/components/calendar/calendar-controls'
import { CharacterSortControl } from '@/components/characters/character-sort-control'
import { RegionFilterControl } from '@/components/characters/region-filter-control'
import { Header } from '@/components/common/header'
import { SelectedStoreList } from '@/components/route/selected-store-list'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

const Controls = () => {
  const [month, setMonth] = useState(10)
  const [randomizations, setRandomizations] = useState(0)
  const [stores, setStores] = useState([
    { id: 'fixture', name: '札幌店', lat: 43, lng: 141, station: '札幌', stations: ['札幌', '大通'] }
  ])
  return (
    <>
      <h1>操作確認</h1>
      <RegionFilterControl />
      <CharacterSortControl onRandomize={() => setRandomizations((value) => value + 1)} />
      <output aria-label='ランダム回数'>{randomizations}</output>
      <CalendarHeader
        year={2026}
        month={month}
        onPrevMonth={() => setMonth(month - 1)}
        onNextMonth={() => setMonth(month + 1)}
        onCurrentMonth={() => setMonth(10)}
      />
      <CalendarMonthTabs selectedMonth={month} onSelectMonth={setMonth} />
      <CalendarMonthDots selectedMonth={month} onSelectMonth={setMonth} />
      <SelectedStoreList
        stores={stores}
        onRemove={(id) => setStores(stores.filter((store) => store.id !== id))}
        onChangeStation={(id, station) =>
          setStores(stores.map((store) => (store.id === id ? { ...store, station } : store)))
        }
        onClearAll={() => setStores([])}
      />
      <button type='button'>最後の操作</button>
    </>
  )
}
const root = createRootRoute({
  component: () => (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  )
})
const controls = createRoute({ path: '/', getParentRoute: () => root, component: Controls })
const characters = createRoute({
  path: '/characters',
  getParentRoute: () => root,
  component: () => <h1>ビッカメ娘一覧</h1>
})
const events = createRoute({
  path: '/events/',
  getParentRoute: () => root,
  component: EventsRoute.options.component,
  validateSearch: EventsRoute.options.validateSearch
})
const router = createRouter({
  routeTree: root.addChildren([controls, characters, events]),
  history: createMemoryHistory({ initialEntries: [new URLSearchParams(location.search).get('path') ?? '/'] })
})
const container = document.getElementById('root')
if (!container) throw new Error('Missing test root')
createRoot(container).render(
  <Provider>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </Provider>
)
