import { MapPinCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
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
 * - 訪問済み ↔ 未訪問をワンタップで切替
 */
export const CharacterVisitButton = ({ storeKey, storeName, hasStore = true }: CharacterVisitButtonProps) => {
  const { isAuthenticated } = useAuth()
  const { isVisited, addVisitedStore, removeVisitedStore, isAddVisitedStorePending, isRemoveVisitedStorePending } =
    useUserActivity()

  if (!hasStore || !isAuthenticated) return null

  const visited = isVisited(storeKey)
  const pending = isAddVisitedStorePending || isRemoveVisitedStorePending

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
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

  return (
    <Button
      size='sm'
      variant='outline'
      onClick={handleToggle}
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
  )
}
