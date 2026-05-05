import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useFavorites } from '@/hooks/use-favorites'
import { cn } from '@/lib/utils'

type CharacterFavoriteButtonProps = {
  characterId: string
  isBiccameMusume?: boolean
}

/**
 * お気に入り（推し）登録ボタン
 * - ビッカメ娘でない場合は表示しない
 * - 未ログイン時は disabled + tooltip 風タイトルでヒント
 */
export const CharacterFavoriteButton = ({ characterId, isBiccameMusume = true }: CharacterFavoriteButtonProps) => {
  const { isAuthenticated } = useAuth()
  const { isFavorite, addFavorite, removeFavorite, isAddPending, isRemovePending } = useFavorites()

  if (!isBiccameMusume) return null

  const favored = isFavorite(characterId)
  const pending = isAddPending || isRemovePending

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isAuthenticated || pending) return
    if (favored) {
      removeFavorite(characterId)
    } else {
      addFavorite(characterId)
    }
  }

  return (
    <Button
      size='sm'
      variant='outline'
      onClick={handleToggle}
      aria-pressed={favored}
      aria-label={favored ? 'お気に入り解除' : 'お気に入り登録'}
      disabled={!isAuthenticated || pending}
      title={!isAuthenticated ? 'ログインすると推し登録できるよ' : undefined}
      className={cn(
        'h-8 w-8 p-0 rounded-full',
        favored
          ? 'border-favorite/60 text-favorite hover:bg-favorite/10 hover:text-favorite'
          : 'border-muted-foreground/30 text-muted-foreground hover:text-favorite hover:border-favorite/40'
      )}
    >
      <motion.span
        initial={false}
        animate={favored ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className='inline-flex items-center justify-center'
      >
        <Heart className={cn('h-4 w-4', favored && 'fill-current')} />
      </motion.span>
    </Button>
  )
}
