import { GAP_STATUSES, GapStatusSchema } from '@biccame/shared/event-detect/viewer'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, Suspense, useId, useState } from 'react'
import { categoryName, storeName } from '@/components/admin/event-detect/constants'
import {
  D1CountBadge,
  EMULATED_STATUS_LABELS,
  EmulatedStatusBadge,
  StartUnknownBadge
} from '@/components/admin/event-detect/emulated-parts'
import {
  emulatedSortToSearch,
  nextEmulatedSort,
  resolveEmulatedSort
} from '@/components/admin/event-detect/emulated-sort'
import { FilterField } from '@/components/admin/event-detect/filter-field'
import { formatDate, formatDay, formatNumber } from '@/components/admin/event-detect/format'
import { ListSkeleton } from '@/components/admin/event-detect/loading'
import { EmptyState, SectionHeading } from '@/components/admin/event-detect/section'
import { SortableTh, Td, TdNum, Th, ThNum } from '@/components/admin/event-detect/table-parts'
import { EventListPagination } from '@/components/admin/event-list-pagination'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { type EmulatedFilter, useEventDetectEmulated } from '@/hooks/use-event-detect'
import { EventDetectEmulatedSearchSchema } from '@/schemas/event-detect-search'

const PER_PAGE = 50

/** Radix の Select は空文字の値を持てないので、「指定なし」はこの値で表す */
const ANY = '__any__'

type Search = ReturnType<typeof Route.useSearch>

/** 検索パラメータを API の絞り込みにする。ended は URL では 1・0 の数字、API では '1'・'0' */
const filterOf = (search: Search): EmulatedFilter => {
  const { page: _page, ended, ...rest } = search
  return { ...rest, ...(ended === undefined ? {} : { ended: ended === 1 ? '1' : '0' }) }
}

/** 絞り込みの項目が 1 つでもあるか（並べ替えとページは含めない） */
const hasFilter = ({ year, store, status, ended, d1, q }: Search) =>
  [year, store, status, ended, d1, q].some((value) => value !== undefined)

/** 絞り込み欄の選択肢の件数つきの表記 */
const withCount = (label: string, count: number) => `${label}（${formatNumber(count)}）`

const Filters = ({
  search,
  onChange,
  onClear
}: {
  search: Search
  onChange: (patch: Partial<Search>) => void
  onClear: () => void
}) => {
  const id = useId()
  // 選択肢は絞り込む前の全体の内訳。条件を変えても動かないよう、条件なしの取得から引く
  const { data } = useEventDetectEmulated({}, 0, 1)
  const [draft, setDraft] = useState(search.q === undefined ? '' : search.q)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onChange({ q: draft === '' ? undefined : draft })
  }
  return (
    <div className='space-y-3'>
      <div className='grid gap-3 md:grid-cols-3'>
        <FilterField label='年'>
          <Select
            value={search.year === undefined ? ANY : String(search.year)}
            onValueChange={(value) => onChange({ year: value === ANY ? undefined : Number(value) })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {data.facets.years.map((entry) => (
                <SelectItem key={entry.year} value={String(entry.year)}>
                  {withCount(String(entry.year), entry.count)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label='店舗'>
          <Select
            value={search.store === undefined ? ANY : search.store}
            onValueChange={(value) => onChange({ store: value === ANY ? undefined : value })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {data.facets.stores.map((entry) => (
                <SelectItem key={entry.store} value={entry.store}>
                  {withCount(storeName(entry.store), entry.count)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label='状態'>
          <Select
            value={search.status === undefined ? ANY : search.status}
            onValueChange={(value) => {
              const status = GapStatusSchema.safeParse(value)
              onChange({ status: status.success ? status.data : undefined })
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              {GAP_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {EMULATED_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </div>
      <div className='grid items-end gap-3 md:grid-cols-[repeat(2,minmax(0,10rem))_minmax(0,1fr)_auto]'>
        <FilterField label='終了'>
          <Select
            value={search.ended === undefined ? ANY : String(search.ended)}
            onValueChange={(value) => onChange({ ended: value === '1' ? 1 : value === '0' ? 0 : undefined })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              <SelectItem value='1'>あり</SelectItem>
              <SelectItem value='0'>なし</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label='D1'>
          <Select
            value={search.d1 === undefined ? ANY : search.d1}
            onValueChange={(value) =>
              onChange({ d1: value === 'matched' ? 'matched' : value === 'none' ? 'none' : undefined })
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>すべて</SelectItem>
              <SelectItem value='matched'>対応あり</SelectItem>
              <SelectItem value='none'>対応なし</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <form onSubmit={submit}>
          <FilterField label='配布物名' htmlFor={`${id}-q`}>
            <Input id={`${id}-q`} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </FilterField>
        </form>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-9'
          disabled={!hasFilter(search)}
          onClick={() => {
            setDraft('')
            onClear()
          }}
        >
          条件をクリア
        </Button>
      </div>
    </div>
  )
}

/** 見出しの件数。一覧と同じ取得なので、リクエストは 1 回にまとまる */
const Count = ({ search }: { search: Search }) => {
  const { data } = useEventDetectEmulated(filterOf(search), (search.page - 1) * PER_PAGE, PER_PAGE)
  return <>{formatNumber(data.total)} 件</>
}

const Results = ({
  search,
  onPage,
  onSort
}: {
  search: Search
  onPage: (page: number) => void
  onSort: (key: ReturnType<typeof resolveEmulatedSort>['key']) => void
}) => {
  const { page } = search
  const offset = (page - 1) * PER_PAGE
  const { data } = useEventDetectEmulated(filterOf(search), offset, PER_PAGE)
  const sort = resolveEmulatedSort(search)
  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE))
  if (data.emulatedAt === null) return <EmptyState>未実行</EmptyState>
  if (data.total === 0) return <EmptyState>該当なし</EmptyState>
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <SortableTh
              scope='col'
              label='店舗'
              order={sort.key === 'store' ? sort.order : null}
              onSort={() => onSort('store')}
            />
            <Th scope='col'>配布物</Th>
            <Th scope='col'>種別</Th>
            <Th scope='col'>状態</Th>
            <ThNum scope='col'>開始</ThNum>
            <ThNum scope='col'>終了予定</ThNum>
            <ThNum scope='col'>終了報告</ThNum>
            <SortableTh
              scope='col'
              label='言及'
              numeric
              order={sort.key === 'mentions' ? sort.order : null}
              onSort={() => onSort('mentions')}
            />
            <SortableTh
              scope='col'
              label='最初の言及'
              numeric
              order={sort.key === 'firstSeen' ? sort.order : null}
              onSort={() => onSort('firstSeen')}
            />
            <SortableTh
              scope='col'
              label='最後の言及'
              numeric
              order={sort.key === 'lastSeen' ? sort.order : null}
              onSort={() => onSort('lastSeen')}
            />
            <ThNum scope='col'>D1</ThNum>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.events.map((event) => (
            <TableRow key={event.id}>
              <Td className='min-w-20'>{storeName(event.store)}</Td>
              <Td className='min-w-40'>
                <Link
                  to='/admin/event-detect/emulated/$id'
                  params={{ id: event.id }}
                  title={event.item}
                  className='line-clamp-2 underline underline-offset-2 hover:text-brand'
                >
                  {event.item}
                </Link>
              </Td>
              <Td className='whitespace-nowrap'>{categoryName(event.category)}</Td>
              <Td>
                <EmulatedStatusBadge status={event.status} />
              </Td>
              <TdNum className='whitespace-nowrap'>
                <span className='inline-flex flex-wrap items-center justify-end gap-2'>
                  {event.startUnknown && <StartUnknownBadge />}
                  {event.startUnknown ? '—' : formatDay(event.startDate)}
                </span>
              </TdNum>
              <TdNum className='whitespace-nowrap'>{formatDay(event.endDate)}</TdNum>
              <TdNum className='whitespace-nowrap'>{formatDay(event.endedAt)}</TdNum>
              <TdNum>{formatNumber(event.mentions)}</TdNum>
              <TdNum className='whitespace-nowrap'>{formatDate(event.firstSeen)}</TdNum>
              <TdNum className='whitespace-nowrap'>{formatDate(event.lastSeen)}</TdNum>
              <TdNum>
                <D1CountBadge d1={event.d1} />
              </TdNum>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <EventListPagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={onPage} />
    </div>
  )
}

const EmulatedPage = () => {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // 絞り込みを変えたら 1 ページ目に戻す
  const update = (patch: Partial<Search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true })
  const sort = resolveEmulatedSort(search)
  return (
    <div className='space-y-4'>
      <SectionHeading
        aside={
          <Suspense fallback={null}>
            <Count search={search} />
          </Suspense>
        }
      >
        LLM イベント
      </SectionHeading>
      <Suspense fallback={<ListSkeleton />}>
        <Filters
          search={search}
          onChange={update}
          onClear={() => navigate({ search: { sort: search.sort, order: search.order, page: 1 }, replace: true })}
        />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <Results
          search={search}
          onPage={(page) => navigate({ search: (previous) => ({ ...previous, page }) })}
          onSort={(key) => update(emulatedSortToSearch(nextEmulatedSort(sort, key)))}
        />
      </Suspense>
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/emulated/')({
  validateSearch: EventDetectEmulatedSearchSchema,
  component: EmulatedPage
})
