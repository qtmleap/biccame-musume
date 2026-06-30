import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Calendar, Copy, ExternalLink, FolderTree, Pencil, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCloudflareAccess } from '@/hooks/use-cloudflare-access'
import { useDeleteEventGroup, useEventGroups } from '@/hooks/use-event-groups'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM, STICKER_TAPES } from '@/lib/sticker'
import { cn } from '@/lib/utils'
import type { EventGroup } from '@/schemas/event-group.dto'

type EventGroupCardProps = {
  group: EventGroup
  index: number
  isAuthenticated: boolean
  onDelete: (id: string) => void
}

const EventGroupCard = ({ group, index, isAuthenticated, onDelete }: EventGroupCardProps) => {
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
            'relative border-card rounded-xl p-3 bg-card flex flex-col h-full border border-zinc-200 dark:border-card-border'
          )}
        >
          {tape && (
            <div aria-hidden className={cn('absolute rounded-sm', tape.position, tape.size, tape.color, tape.angle)} />
          )}
          <div className='mb-2 flex items-start justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <h3 className='text-base font-semibold text-foreground line-clamp-2'>{group.title}</h3>
              <div className='mt-1 flex flex-col gap-1 text-xs text-muted-foreground'>
                <span className='flex items-center gap-1'>
                  <Calendar className='size-3' />
                  <span>{dayjs(group.startDate).format('YYYY/MM/DD')}</span>
                  {group.endDate ? (
                    <>
                      <span>〜</span>
                      <span>{dayjs(group.endDate).format('YYYY/MM/DD')}</span>
                    </>
                  ) : (
                    <span>〜期間未定</span>
                  )}
                </span>
                {group.description && <p className='line-clamp-2'>{group.description}</p>}
              </div>
            </div>
            <Badge variant='secondary' className='tabular-nums shrink-0'>
              {group.eventCount}
            </Badge>
          </div>

          {/* アクション */}
          <div className='flex items-center justify-between mt-auto'>
            <div className='flex items-center gap-1'>
              <Link to='/events/group/$id' params={{ id: group.uuid }}>
                <Button size='sm' variant='outline' className='border-card-border'>
                  <ExternalLink className='mr-1 size-3' />
                  詳細
                </Button>
              </Link>
            </div>
            {isAuthenticated && (
              <div className='flex items-center gap-2'>
                <Link to='/admin/event-groups/new' search={{ from: group.uuid }} aria-label='コピーして新規作成'>
                  <Button size='sm' variant='outline' className='border-card-border'>
                    <Copy className='mr-1 size-3' />
                    コピー
                  </Button>
                </Link>
                <Link to='/admin/event-groups/$uuid/edit' params={{ uuid: group.uuid }}>
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
                      <AlertDialogTitle>このイベントグループを削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        紐付いている {group.eventCount} 件のイベントは削除されず、グループから外れます。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction variant='destructive' onClick={() => onDelete(group.uuid)}>
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

export const EventGroupList = () => {
  const { data: groups } = useEventGroups()
  const { isAuthenticated } = useCloudflareAccess()
  const deleteGroup = useDeleteEventGroup()

  const handleDelete = (id: string) => {
    deleteGroup.mutate(id)
  }

  if (groups.length === 0) {
    return (
      <div className='rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground'>
        <FolderTree className='mx-auto mb-2 size-8' />
        <p className='text-sm'>イベントグループはまだ登録されていません。</p>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
      {groups.map((group, index) => (
        <EventGroupCard
          key={group.uuid}
          group={group}
          index={index}
          isAuthenticated={isAuthenticated}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}
