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
import { Button } from '@/components/ui/button'
import { useDeleteEventGroup, useEventGroups } from '@/hooks/use-event-groups'
import type { EventGroup } from '@/schemas/event-group.dto'

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
    <div className='flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-sm'>
      <div className='flex-1 min-w-0'>
        <h3 className='text-base font-semibold text-foreground'>{group.title}</h3>
        {group.description && <p className='mt-2 text-sm text-foreground/80 line-clamp-3'>{group.description}</p>}
        <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          <span>{formatPeriod(group)}</span>
          <span>所属イベント: {group.eventCount} 件</span>
          <span>並び順: {group.sortOrder}</span>
        </div>
      </div>
      <div className='mt-4 flex items-center gap-2'>
        <Button asChild variant='outline' size='sm' className='flex-1'>
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
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
      {groups.map((group) => (
        <EventGroupRow key={group.uuid} group={group} />
      ))}
    </div>
  )
}
