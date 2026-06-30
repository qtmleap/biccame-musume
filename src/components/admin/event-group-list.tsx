import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { FolderTree, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { useDeleteEventGroup, useEventGroups } from '@/hooks/use-event-groups'
import type { EventGroup, EventGroupItemType } from '@/schemas/event-group.dto'

const ITEM_TYPE_LABELS: Record<EventGroupItemType, string> = {
  card: '名刺',
  badge: '缶バッジ',
  other: 'その他'
}

const formatPeriod = (group: EventGroup): string => {
  const start = dayjs(group.startDate).format('YYYY/MM/DD')
  if (!group.endDate) return `${start} 〜（期間未定）`
  return `${start} 〜 ${dayjs(group.endDate).format('YYYY/MM/DD')}`
}

const EventGroupRow = ({ group }: { group: EventGroup }) => {
  const deleteGroup = useDeleteEventGroup()
  const [open, setOpen] = useState(false)

  const handleDelete = async () => {
    try {
      await deleteGroup.mutateAsync(group.uuid)
    } finally {
      setOpen(false)
    }
  }

  return (
    <div className='rounded-lg border border-border bg-card p-4 shadow-sm'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='flex-1 min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>{ITEM_TYPE_LABELS[group.itemType]}</Badge>
            <h3 className='text-base font-semibold text-foreground'>{group.title}</h3>
          </div>
          <p className='mt-1 text-xs text-muted-foreground break-all'>/events/group/{group.slug}</p>
          {group.description && <p className='mt-2 text-sm text-foreground/80'>{group.description}</p>}
          <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
            <span>{formatPeriod(group)}</span>
            <span>所属イベント: {group.eventCount} 件</span>
            <span>並び順: {group.sortOrder}</span>
          </div>
        </div>
        <div className='flex items-center gap-2 self-end sm:self-start'>
          <Button asChild variant='outline' size='sm'>
            <Link to='/admin/event-groups/$uuid/edit' params={{ uuid: group.uuid }}>
              <Pencil className='mr-1 size-4' />
              編集
            </Link>
          </Button>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant='destructive' size='sm'>
                <Trash2 className='mr-1 size-4' />
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
                <AlertDialogAction onClick={handleDelete}>削除する</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}

export const EventGroupList = () => {
  const { data: groups } = useEventGroups()

  if (groups.length === 0) {
    return (
      <div className='rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground'>
        <FolderTree className='mx-auto mb-2 size-8' />
        <p className='text-sm'>イベントグループはまだ登録されていません。</p>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      {groups.map((group) => (
        <EventGroupRow key={group.uuid} group={group} />
      ))}
    </div>
  )
}
