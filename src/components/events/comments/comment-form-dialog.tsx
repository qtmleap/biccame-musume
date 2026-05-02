import { MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { CommentForm } from './comment-form'

type CommentFormDialogProps = {
  eventUuid: string
}

const TriggerButton = () => (
  <Button type='button' aria-label='コメントを投稿する' className='w-full bg-[#e50012] hover:bg-[#c5000f] text-white'>
    <MessageSquarePlus className='size-4' />
    コメントを投稿する
  </Button>
)

export const CommentFormDialog = ({ eventUuid }: CommentFormDialogProps) => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <TriggerButton />
        </DialogTrigger>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>コメントを投稿</DialogTitle>
          </DialogHeader>
          <CommentForm eventUuid={eventUuid} onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <TriggerButton />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>コメントを投稿</DrawerTitle>
        </DrawerHeader>
        <div className='px-4 pb-6'>
          <CommentForm eventUuid={eventUuid} onSuccess={() => setOpen(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
