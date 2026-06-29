import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Copy, ExternalLink, Package, Pencil, Store, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import { STATUS_BADGE } from '@/locales/component'
import type { Event } from '@/schemas/event.dto'
import type { StoreKey } from '@/schemas/store.dto'

type EventCardProps = {
  event: Event
  index: number
  onDelete: (id: string) => void
  isAuthenticated: boolean
}

/**
 * 管理者イベント一覧の 1 枚分のカード。
 * 詳細リンク + (認証時は) コピー / 編集 / 削除ボタン群を持つ。
 */
export const EventCard = ({ event, index, onDelete, isAuthenticated }: EventCardProps) => {
  const now = dayjs()
  const end = event.endDate ? dayjs(event.endDate) : null
  const isEnded = event.endedAt != null || (end && now.isAfter(end))
  const tape = STICKER_TAPES[index % STICKER_TAPES.length]

  return (
    <motion.div className='h-full' style={{ filter: STICKER_SHADOW_SM }}>
      <motion.div
        className='h-full'
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <div
          className={cn(
            'relative border-card rounded-xl p-3 bg-card flex flex-col h-full border border-zinc-200 dark:border-card-border',
            isEnded && 'opacity-50 grayscale'
          )}
        >
          {tape && (
            <div aria-hidden className={cn('absolute rounded-sm', tape.position, tape.size, tape.color, tape.angle)} />
          )}
          <div className='mb-2 flex items-start justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base font-semibold text-foreground line-clamp-2'>{event.title}</h3>
              <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  <Calendar className='size-3' />
                  <span>{dayjs(event.startDate).format('YYYY/MM/DD')}</span>
                  {event.endDate ? (
                    <>
                      <span>〜</span>
                      <span>{dayjs(event.endDate).format('YYYY/MM/DD')}</span>
                    </>
                  ) : (
                    <span>〜なくなり次第終了</span>
                  )}
                </span>
                <div className='flex flex-wrap items-center gap-2'>
                  {event.stores && event.stores.length > 0 && (
                    <span className='flex items-center gap-1'>
                      <Store className='size-3' />
                      {event.stores.length === 1
                        ? STORE_NAME_LABELS[event.stores[0] as StoreKey]
                        : `${event.stores.length}店舗`}
                    </span>
                  )}
                  {event.limitedQuantity && !event.conditions.some((c) => c.type === 'everyone') && (
                    <span className='flex items-center gap-1'>
                      <Package className='size-3' />
                      限定{event.limitedQuantity}個
                    </span>
                  )}
                </div>
              </div>
            </div>
            {STATUS_BADGE[event.status]()}
          </div>

          {/* アクション */}
          <div className='flex items-center justify-between mt-auto'>
            <div className='flex items-center gap-1'>
              <Link to='/events/$uuid' params={{ uuid: event.uuid }}>
                <Button size='sm' variant='outline' className='border-card-border'>
                  <ExternalLink className='mr-1 size-3' />
                  詳細
                </Button>
              </Link>
            </div>
            {isAuthenticated && (
              <div className='flex items-center gap-2'>
                <Link to='/admin/events/new' search={{ from: event.uuid }} aria-label='コピーして新規作成'>
                  <Button size='sm' variant='outline' className='border-card-border'>
                    <Copy className='mr-1 size-3' />
                    コピー
                  </Button>
                </Link>
                <Link to='/admin/events/$uuid/edit' params={{ uuid: event.uuid }}>
                  <Button size='sm' variant='outline' className='border-card-border'>
                    <Pencil className='mr-1 size-3' />
                    編集
                  </Button>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size='sm' variant='destructive'>
                      <Trash2 className='mr-1 size-3' />
                      削除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>イベントを削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction variant='destructive' onClick={() => onDelete(event.uuid)}>
                        削除する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
