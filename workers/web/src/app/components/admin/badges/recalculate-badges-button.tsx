import { RefreshCw } from 'lucide-react'
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
import { useRecalculateBadges } from '@/hooks/use-admin-badges'
import { cn } from '@/lib/utils'

export const RecalculateBadgesButton = () => {
  const recalc = useRecalculateBadges()
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size='sm' variant='outline' disabled={recalc.isPending}>
          <RefreshCw className={cn('size-4 mr-1', recalc.isPending && 'animate-spin')} />
          {recalc.isPending ? '再評価中...' : 'バッジ再評価'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className='rounded-2xl shadow-2xl border-transparent'>
        <AlertDialogHeader>
          <AlertDialogTitle>全ユーザーのバッジを再評価しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            店舗数や条件メタが変わった時に使用。全ユーザー × 全バッジを評価して未獲得の条件達成バッジを付与します。
            ユーザー数によっては数十秒かかる場合があります。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              recalc.mutate()
              setOpen(false)
            }}
            variant='outline'
            className='border-brand/50 text-brand hover:bg-brand/10 hover:text-brand hover:border-brand/50'
          >
            実行する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
