import dayjs from 'dayjs'
import { Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useLinkEventsToGroup, useUnlinkEventsFromGroup } from '@/hooks/use-event-groups'
import { useEvents } from '@/hooks/use-events'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

const formatStores = (event: Event): string => {
  if (event.stores.length === 0) return '店舗未設定'
  const labels = event.stores.map((key) => STORE_NAME_LABELS[key as StoreKey] ?? key)
  return labels.length <= 3 ? labels.join(' / ') : `${labels.slice(0, 3).join(' / ')} 他 ${labels.length - 3} 店`
}

type EventRowProps = {
  event: Event
  action: 'add' | 'remove'
  disabled: boolean
  onAction: (eventId: string) => void
}

const EventRow = ({ event, action, disabled, onAction }: EventRowProps) => (
  <div className='flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2'>
    <div className='min-w-0 flex-1'>
      <p className='truncate text-sm font-medium text-foreground'>{event.title}</p>
      <p className='mt-0.5 text-xs text-muted-foreground'>
        {dayjs(event.startDate).format('YYYY/MM/DD')} ・ {formatStores(event)}
      </p>
    </div>
    <Button
      type='button'
      size='sm'
      variant={action === 'add' ? 'outline' : 'destructive'}
      onClick={() => onAction(event.uuid)}
      disabled={disabled}
    >
      {action === 'add' ? (
        <>
          <Plus className='mr-1 size-3.5' />
          追加
        </>
      ) : (
        <>
          <X className='mr-1 size-3.5' />
          外す
        </>
      )}
    </Button>
  </div>
)

type EventGroupEventManagerProps = {
  groupId: string
  linkedEvents: Event[]
}

/**
 * EventGroup 編集画面に置く Event 連携 UI。
 * - 上: このグループに所属する Event（解除ボタンつき）
 * - 下: 未所属 Event をタイトル検索して追加
 */
export const EventGroupEventManager = ({ groupId, linkedEvents }: EventGroupEventManagerProps) => {
  const { data: allEvents } = useEvents()
  const link = useLinkEventsToGroup()
  const unlink = useUnlinkEventsFromGroup()
  const [query, setQuery] = useState('')

  const linkedIds = useMemo(() => new Set(linkedEvents.map((e) => e.uuid)), [linkedEvents])

  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    // 開催日昇順 → 先頭店舗キー昇順で並べる。タイトルが似通うキャンペーン用途で
    // 一覧の視認性を上げるための統一ソート（公開ページ / API レスポンスと同じ規則）
    return allEvents
      .filter((e) => !linkedIds.has(e.uuid))
      .filter((e) => !e.groupId)
      .filter((e) => (normalized === '' ? true : e.title.toLowerCase().includes(normalized)))
      .slice()
      .sort((a, b) => {
        const dateDiff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        if (dateDiff !== 0) return dateDiff
        const aStore = a.stores[0] ?? ''
        const bStore = b.stores[0] ?? ''
        return aStore.localeCompare(bStore, 'ja')
      })
      .slice(0, 50)
  }, [allEvents, linkedIds, query])

  const isMutating = link.isPending || unlink.isPending

  const handleAdd = (eventId: string) => link.mutate({ groupId, eventIds: [eventId] })
  const handleRemove = (eventId: string) => unlink.mutate({ groupId, eventIds: [eventId] })

  return (
    <div className='rounded-lg border border-border bg-muted/30 p-4 md:p-5'>
      <h2 className='text-lg font-bold text-foreground'>イベントの紐付け管理</h2>
      <p className='mt-1 text-sm text-muted-foreground'>
        このグループに含めるイベントを管理します。Event 編集画面の「所属グループ」セレクトでも変更できます。
      </p>

      <Separator className='my-4' />

      {/* このグループに所属している Event */}
      <section>
        <h3 className='text-sm font-semibold text-foreground'>このグループに所属（{linkedEvents.length} 件）</h3>
        {linkedEvents.length === 0 ? (
          <p className='mt-2 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground'>
            まだ Event が紐付いていません。下の「追加できる Event」から選んでね。
          </p>
        ) : (
          <div className='mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1'>
            {linkedEvents.map((event) => (
              <EventRow key={event.uuid} event={event} action='remove' disabled={isMutating} onAction={handleRemove} />
            ))}
          </div>
        )}
      </section>

      <Separator className='my-4' />

      {/* 追加候補 Event */}
      <section>
        <h3 className='text-sm font-semibold text-foreground'>追加できる Event（未所属のみ）</h3>
        <div className='mt-2 relative'>
          <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='text'
            placeholder='タイトルで絞り込み'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className='pl-8'
          />
        </div>
        {candidates.length === 0 ? (
          <p className='mt-2 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground'>
            {query.trim() === '' ? '追加できる Event がありません。' : '該当する Event が見つかりません。'}
          </p>
        ) : (
          <div className='mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1'>
            {candidates.map((event) => (
              <EventRow key={event.uuid} event={event} action='add' disabled={isMutating} onAction={handleAdd} />
            ))}
          </div>
        )}
        <p className='mt-2 text-xs text-muted-foreground'>
          直近半年以内のイベントを最大 50 件表示。検索で絞り込めます。
        </p>
      </section>
    </div>
  )
}
