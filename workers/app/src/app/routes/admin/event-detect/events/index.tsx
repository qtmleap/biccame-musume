import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { categoryName, storeName } from '@/components/admin/event-detect/constants'
import { formatDate } from '@/components/admin/event-detect/format'
import { EmptyState, Note } from '@/components/admin/event-detect/section'
import { SegmentButton } from '@/components/admin/event-detect/segment-button'
import { Td, TdNum, Th, ThNum } from '@/components/admin/event-detect/table-parts'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { useEventDetectEvents } from '@/hooks/use-event-detect'
import { EVENT_DETECT_EVENT_MODES, EventDetectEventsSearchSchema } from '@/schemas/event-detect-search'

const MODE_LABELS: Record<(typeof EVENT_DETECT_EVENT_MODES)[number], string> = {
  all: 'すべて',
  end_candidate: '終了の登録漏れ候補',
  no_archived: '正解投稿がアーカイブに無い',
  announce_only: '告知のみ'
}

const EventsPage = () => {
  const { data } = useEventDetectEvents()
  const { mode, q } = Route.useSearch()
  const navigate = Route.useNavigate()
  // 入力中の文字は画面内で持ち、Enter なしでも絞り込む。URL へは確定時（フォーカスを外したとき）に書く
  const [query, setQuery] = useState(q === undefined ? '' : q)

  const events = useMemo(
    () =>
      data.events
        .filter((event) => {
          if (mode === 'end_candidate') return event.endCandidate
          if (mode === 'no_archived') return event.archived === 0
          if (mode === 'announce_only') return event.refs.start === 0 && event.refs.end === 0
          return true
        })
        .filter((event) => !query || event.title.includes(query) || event.stores.some((store) => store.includes(query)))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.events, mode, query]
  )

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        {EVENT_DETECT_EVENT_MODES.map((value) => (
          <SegmentButton
            key={value}
            pressed={mode === value}
            className='h-8 px-2.5 text-sm'
            onClick={() => navigate({ search: (previous) => ({ ...previous, mode: value }), replace: true })}
          >
            {MODE_LABELS[value]}
          </SegmentButton>
        ))}
        <Input
          aria-label='タイトル・店舗キーで絞り込む'
          className='ml-auto w-64'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={() =>
            navigate({ search: (previous) => ({ ...previous, q: query === '' ? undefined : query }), replace: true })
          }
          placeholder='タイトル・店舗キー'
        />
        <span className='w-16 text-right text-sm text-muted-foreground tabular-nums'>{events.length} 件</span>
      </div>
      <Note>
        終了の登録漏れ候補: 終了の参考 URL
        も実終了日時も無いが、開始後に担当アカウントが「終了」系の語と景品名を含む投稿をしているイベント。別の景品の終了報告も混ざる。
      </Note>
      {events.length === 0 ? (
        <EmptyState>条件に合うイベントはありません</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <Th>開始</Th>
              <Th>終了予定</Th>
              <Th>実終了</Th>
              <Th>店舗</Th>
              <Th>タイトル</Th>
              <Th>カテゴリ</Th>
              <ThNum>告知</ThNum>
              <ThNum>開始</ThNum>
              <ThNum>終了</ThNum>
              <ThNum>アーカイブ内</ThNum>
              <ThNum>関連投稿</ThNum>
              <Th className='w-8'>
                <span className='sr-only'>詳細</span>
              </Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.uuid} className='focus-within:bg-muted/50'>
                <TdNum className='whitespace-nowrap'>{formatDate(event.startDate)}</TdNum>
                <TdNum className='whitespace-nowrap'>{formatDate(event.endDate)}</TdNum>
                <TdNum className='whitespace-nowrap'>{formatDate(event.endedAt)}</TdNum>
                <Td>{event.stores.map(storeName).join(', ')}</Td>
                <Td className='min-w-48'>
                  <Link
                    to='/admin/event-detect/events/$uuid'
                    params={{ uuid: event.uuid }}
                    className='underline underline-offset-2 hover:text-brand'
                  >
                    {event.title}
                  </Link>
                </Td>
                <Td className='whitespace-nowrap'>{categoryName(event.category)}</Td>
                <TdNum>{event.refs.announce}</TdNum>
                <TdNum>{event.refs.start}</TdNum>
                <TdNum>{event.refs.end}</TdNum>
                <TdNum>{event.archived}</TdNum>
                <TdNum>{event.related}</TdNum>
                <Td aria-hidden className='text-muted-foreground'>
                  <ChevronRight className='size-4' />
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export const Route = createFileRoute('/admin/event-detect/events/')({
  validateSearch: EventDetectEventsSearchSchema,
  component: EventsPage
})
