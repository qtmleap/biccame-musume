import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { CommentForm } from './comment-form'

type CommentFormDialogProps = {
  eventUuid: string
}

const triggerButtonClassName = 'w-full md:max-w-sm md:mx-auto md:flex'

export const CommentFormDialog = ({ eventUuid }: CommentFormDialogProps) => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type='button' aria-label='コメントを投稿する' className={triggerButtonClassName}>
            <MessageSquarePlus className='size-4' />
            コメントを投稿する
          </Button>
        </DialogTrigger>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>コメントを投稿</DialogTitle>
            <DialogDescription>このイベントへの感想や気になることを書き込めます。</DialogDescription>
          </DialogHeader>
          <CommentForm eventUuid={eventUuid} onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button type='button' aria-label='コメントを投稿する' className={triggerButtonClassName}>
          <MessageSquarePlus className='size-4' />
          コメントを投稿する
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>コメントを投稿</DrawerTitle>
          <DrawerDescription>このイベントへの感想や気になることを書き込めます。</DrawerDescription>
        </DrawerHeader>
        <div className='px-4 pb-6'>
          <CommentForm eventUuid={eventUuid} onSuccess={() => setOpen(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
