import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { BotSettingsLayout } from '@/components/admin/bot-settings-layout'
import { EventListPagination } from '@/components/admin/event-list-pagination'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminWebhookEvents } from '@/hooks/use-events'
import { cn } from '@/lib/utils'
import { EVENT_CATEGORY_LABELS } from '@/locales/app.content'
import { STATUS_BADGE } from '@/locales/component'

const PAGE_SIZE = 12

export const EventPostList = () => {
  const events = useAdminWebhookEvents()
  const [page, setPage] = useState(1)
  const totalPages = events.data ? Math.ceil(events.data.length / PAGE_SIZE) : 0
  const effectivePage = Math.min(page, Math.max(totalPages, 1))

  return (
    <BotSettingsLayout
      title='自動作成イベント'
      description='Webhook受信から作成されたイベント一覧です。保留を承認して作成したイベントも含みます。'
      actions={
        <Button variant='outline' onClick={() => events.refetch()} disabled={events.isFetching}>
          <RefreshCw className={cn('size-4', events.isFetching && 'animate-spin')} />
          更新
        </Button>
      }
    >
      <div aria-live='polite' className='text-sm'>
        {events.isPending && <p className='text-muted-foreground'>イベントを取得しています。</p>}
        {events.isError && <p className='text-destructive'>イベントを取得できませんでした。更新から再試行できます。</p>}
        {events.isSuccess && events.data.length === 0 && (
          <p className='py-8 text-center text-muted-foreground'>Webhookから作成されたイベントはありません。</p>
        )}
      </div>
      {events.isSuccess && events.data.length > 0 && (
        <>
          <div className='overflow-x-auto border-y border-separator'>
            <Table className='whitespace-nowrap [&_tr]:border-separator'>
              <TableHeader>
                <TableRow>
                  <TableHead>イベント名</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>開始日</TableHead>
                  <TableHead>終了日</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.data.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE).map((event) => (
                  <TableRow key={event.uuid}>
                    <TableCell>
                      <Link to='/events/$uuid' params={{ uuid: event.uuid }} className='font-medium hover:underline'>
                        {event.title}
                      </Link>
                    </TableCell>
                    <TableCell>{EVENT_CATEGORY_LABELS[event.category]}</TableCell>
                    <TableCell className='tabular-nums'>{dayjs(event.startDate).format('YYYY/MM/DD')}</TableCell>
                    <TableCell className='tabular-nums'>
                      {event.endDate ? dayjs(event.endDate).format('YYYY/MM/DD') : '—'}
                    </TableCell>
                    <TableCell>{STATUS_BADGE[event.status]()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <EventListPagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </BotSettingsLayout>
  )
}
