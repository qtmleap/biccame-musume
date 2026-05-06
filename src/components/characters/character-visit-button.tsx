import { MapPinCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
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
import { useAuth } from '@/hooks/use-auth'
import { useUserActivity } from '@/hooks/use-user-activity'
import { cn } from '@/lib/utils'

type CharacterVisitButtonProps = {
  storeKey: string
  storeName?: string
  /** 店舗紐付けがないキャラ（ビッカメ娘ではない等）の場合は非表示にしたい時に false */
  hasStore?: boolean
}

/**
 * 店舗訪問の自己申告トグル
 * - 店舗紐付けが無い・未ログインのキャラでは非表示
 * - 訪問済み ↔ 未訪問の切替時に確認ダイアログを挟む（誤タップ防止）
 */
export const CharacterVisitButton = ({ storeKey, storeName, hasStore = true }: CharacterVisitButtonProps) => {
  const { isAuthenticated } = useAuth()
  const { isVisited, addVisitedStore, removeVisitedStore, isAddVisitedStorePending, isRemoveVisitedStorePending } =
    useUserActivity()
  const [open, setOpen] = useState(false)

  if (!hasStore || !isAuthenticated) return null

  const visited = isVisited(storeKey)
  const pending = isAddVisitedStorePending || isRemoveVisitedStorePending

  const handleConfirm = () => {
    setOpen(false)
    if (visited) {
      removeVisitedStore(storeKey)
      return
    }
    addVisitedStore(storeKey, {
      onSuccess: () => {
        const label = storeName ? `${storeName}を訪問済みにしたよ！` : '訪問済みにしたよ！'
        toast.success(label, {
          classNames: {
            toast: 'text-foreground',
            description: 'text-foreground! font-semibold!',
            icon: 'text-brand'
          },
          icon: <MapPinCheck className='fill-current' />
        })
      }
    })
  }

  const dialogTitle = visited ? '訪問済みを解除しますか？' : 'この店舗を訪問しましたか？'
  const dialogDescription = visited
    ? `${storeName ?? 'この店舗'}の訪問記録を取り消します。獲得済みの訪問系バッジは取り消されませんが、未獲得バッジの判定からは外れます。`
    : `${storeName ?? 'この店舗'}を訪問済みとして記録します。実際に訪問したお店だけ申告してね。`

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size='sm'
          variant='outline'
          aria-pressed={visited}
          aria-label={visited ? '訪問済み解除' : '訪問済みにする'}
          disabled={pending}
          className={cn(
            'h-8 w-8 p-0 rounded-full',
            visited
              ? 'border-brand/60 bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand'
              : 'border-muted-foreground/30 text-muted-foreground hover:text-brand hover:border-brand/40'
          )}
        >
          <motion.span
            initial={false}
            animate={visited ? { scale: [1, 1.3, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className='inline-flex items-center justify-center'
          >
            <MapPinCheck className='h-4 w-4' />
          </motion.span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>{visited ? '解除する' : '訪問済みにする'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
