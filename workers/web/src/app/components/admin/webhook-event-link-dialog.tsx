import type { Event } from '@biccame/shared/schemas/event.dto'
import dayjs from 'dayjs'
import { Link2, RefreshCw, Search } from 'lucide-react'
import { useReducer, useRef, useState } from 'react'
import {
  initialWebhookEventSearch,
  reduceWebhookEventSearch,
  searchWebhookLinkEvents,
  selectedWebhookLinkEvent,
  type WebhookEventSearchState,
  webhookEventCharacterNames,
  webhookEventStoreNames
} from '@/components/admin/webhook-event-search'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAdminEventOptions } from '@/hooks/use-events'
import { cn } from '@/lib/utils'

type LinkDialogProps = {
  disabled: boolean
  isPending: boolean
  /** 登録済みの連携先を付け替えるときは true。説明に、元のイベントは変更しない旨を足す。 */
  replacing: boolean
  /** 連携先の提案（終了と判定された投稿）のイベント ID。あるときだけ、ダイアログを開いた時点でそのイベントを選択済みにする（連携は人が押すまで行わない）。 */
  suggestedEventId?: string
  onLink: (eventId: string) => Promise<unknown>
}

export const WebhookEventSearchResults = ({
  events,
  state,
  disabled,
  onSelect
}: {
  events: readonly Event[]
  state: WebhookEventSearchState
  disabled: boolean
  onSelect: (id: string) => void
}) => {
  const results = searchWebhookLinkEvents(events, state.search)
  return (
    <div className='min-h-0 overflow-y-auto border-y border-separator'>
      <p role='status' className='py-2 text-sm text-muted-foreground'>
        {results.length === 0 ? '条件に一致するイベントがありません。' : `${results.length}件のイベント`}
      </p>
      <fieldset disabled={disabled} className='min-w-0'>
        <legend className='sr-only'>連携先のイベントを選択</legend>
        {results.map((event) => (
          <label
            key={event.uuid}
            className={cn(
              'flex cursor-pointer items-center gap-3 border-t border-separator px-2 py-3 hover:bg-brand/5',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-brand',
              state.selectedId === event.uuid && 'bg-brand/10',
              disabled && 'cursor-default opacity-60'
            )}
          >
            <input
              type='radio'
              name='webhook-link-event'
              value={event.uuid}
              checked={state.selectedId === event.uuid}
              onChange={() => onSelect(event.uuid)}
              className='size-4 shrink-0 accent-brand'
            />
            <span className='min-w-0'>
              <span className='block break-words font-medium'>{event.title}</span>
              <span className='mt-1 block text-xs text-muted-foreground'>
                開始日 {dayjs(event.startDate).format('YYYY/MM/DD')} · {webhookEventStoreNames(event)}
              </span>
              <span className='mt-1 block text-xs text-muted-foreground'>
                対象ビッカメ娘：{event.characterIds.length === 0 ? '未判定' : webhookEventCharacterNames(event)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}

const WebhookEventLinkContent = ({
  disabled,
  isPending,
  replacing,
  suggestedEventId,
  onLink,
  onClose
}: LinkDialogProps & { onClose: () => void }) => {
  const eventsQuery = useAdminEventOptions()
  const [state, dispatch] = useReducer(reduceWebhookEventSearch, suggestedEventId, initialWebhookEventSearch)
  const [failed, setFailed] = useState(false)
  const submitting = useRef(false)
  const events = eventsQuery.data === undefined ? [] : eventsQuery.data
  const selected = selectedWebhookLinkEvent(events, state)
  const blocked = disabled || isPending || eventsQuery.isPending || eventsQuery.isError || selected === undefined
  const submit = async () => {
    if (blocked || selected === undefined || submitting.current) return
    submitting.current = true
    setFailed(false)
    try {
      await onLink(selected.uuid)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      submitting.current = false
    }
  }
  return (
    <DialogContent
      className='max-h-[85dvh] border-card-border sm:max-w-2xl'
      showCloseButton={!isPending}
      onEscapeKeyDown={(event) => {
        if (isPending) event.preventDefault()
      }}
      onInteractOutside={(event) => {
        if (isPending) event.preventDefault()
      }}
    >
      <DialogHeader>
        <DialogTitle>既存イベントへ連携</DialogTitle>
        <DialogDescription>
          イベント名・店舗・ビッカメ娘・開始日で検索して選択してください。既存イベントの内容は変更しません。
          {replacing && '登録済みのため、現在の連携先を置き換えます（元のイベントの内容は変更しません）。'}
        </DialogDescription>
      </DialogHeader>
      <form
        className='flex min-h-0 flex-col gap-4 overflow-hidden'
        onSubmit={async (event) => {
          event.preventDefault()
          await submit()
        }}
      >
        <div className='space-y-2'>
          <label htmlFor='webhook-link-search' className='flex items-center gap-2 text-sm font-medium'>
            <Search className='size-4' aria-hidden='true' />
            イベントを検索
          </label>
          <Input
            id='webhook-link-search'
            value={state.search}
            onChange={(event) => {
              dispatch({ type: 'search', value: event.target.value })
              setFailed(false)
            }}
            placeholder='イベント名・店舗・ビッカメ娘・開始日'
            className='border-card-border'
            disabled={isPending}
          />
        </div>
        {eventsQuery.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            イベントを取得しています。
          </p>
        ) : eventsQuery.isError ? (
          <div role='alert' className='space-y-2'>
            <p className='text-sm text-destructive'>イベントを取得できませんでした。</p>
            <Button
              type='button'
              variant='outline'
              className='border-card-border'
              onClick={() => eventsQuery.refetch()}
            >
              <RefreshCw className='size-4' />
              再取得
            </Button>
          </div>
        ) : (
          <WebhookEventSearchResults
            events={events}
            state={state}
            disabled={isPending}
            onSelect={(id) => {
              dispatch({ type: 'select', id })
              setFailed(false)
            }}
          />
        )}
        <p aria-live='polite' className='text-sm text-muted-foreground'>
          {selected === undefined ? '連携先を選択してください。' : `選択中：${selected.title}`}
        </p>
        {failed && (
          <p role='alert' className='text-sm text-destructive'>
            連携に失敗しました。内容を確認して再試行してください。
          </p>
        )}
        <DialogFooter>
          <Button type='button' variant='outline' className='border-card-border' onClick={onClose} disabled={isPending}>
            キャンセル
          </Button>
          <Button type='submit' className='bg-brand text-brand-foreground hover:bg-brand/90' disabled={blocked}>
            {isPending ? '連携中…' : '連携する'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export const WebhookEventLinkDialog = (props: LinkDialogProps) => {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!props.isPending) setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant='outline' className='border-card-border' disabled={props.disabled || props.isPending}>
          <Link2 className='size-4' />
          連携
        </Button>
      </DialogTrigger>
      {open && <WebhookEventLinkContent {...props} onClose={() => setOpen(false)} />}
    </Dialog>
  )
}
