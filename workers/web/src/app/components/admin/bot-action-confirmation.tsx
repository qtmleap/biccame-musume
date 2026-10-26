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
  /** 実行ボタンだけを無効にする（キャンセルは押せる）。実行できない理由を description に出すときに使う。省略時は無効にしない。 */
  actionDisabled?: boolean
  onConfirm: () => Promise<void>
}

export const BotActionConfirmation = ({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  isPending,
  actionDisabled = false,
  onConfirm
}: BotActionConfirmationProps) => (
  <AlertDialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        {/* キャンセルは AlertDialogCancel の既定で outline。枠線色は呼び出し側で共通テーマ色にそろえる。 */}
        <AlertDialogCancel className='border-card-border' disabled={isPending}>
          キャンセル
        </AlertDialogCancel>
        <Button
          className='bg-brand text-brand-foreground hover:bg-brand/90'
          onClick={onConfirm}
          disabled={isPending || actionDisabled}
        >
          {isPending && <Loader2 className='size-4 animate-spin' />}
          {actionLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
