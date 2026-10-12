import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

type BotActionConfirmationProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  actionLabel: string
  isPending: boolean
  onConfirm: () => Promise<void>
}

export const BotActionConfirmation = ({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  isPending,
  onConfirm
}: BotActionConfirmationProps) => (
  <AlertDialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
        <Button className='bg-brand text-brand-foreground hover:bg-brand/90' onClick={onConfirm} disabled={isPending}>
          {isPending && <Loader2 className='size-4 animate-spin' />}
          {actionLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
