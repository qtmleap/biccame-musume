import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FavoriteBurst } from '@/components/characters/favorite-burst'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useFavorites } from '@/hooks/use-favorites'
import { cn } from '@/lib/utils'

type CharacterFavoriteButtonProps = {
  characterId: string
  characterName?: string
  isBiccameMusume?: boolean
}

/**
 * お気に入り（推し）登録ボタン
 * - ビッカメ娘でない場合は非表示
 * - 未ログイン時も非表示（詳細画面でログインユーザーだけが触れる導線）
 */
export const CharacterFavoriteButton = ({
  characterId,
  characterName,
  isBiccameMusume = true
}: CharacterFavoriteButtonProps) => {
  const { isAuthenticated } = useAuth()
  const { isFavorite, addFavorite, removeFavorite, isAddPending, isRemovePending } = useFavorites()
  const [burstKey, setBurstKey] = useState<number | null>(null)

  if (!isBiccameMusume || !isAuthenticated) return null

  const favored = isFavorite(characterId)
  const pending = isAddPending || isRemovePending

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    if (favored) {
      removeFavorite(characterId)
      return
    }
    addFavorite(characterId, {
      onSuccess: () => {
        setBurstKey(Date.now())
        const label = characterName ? `${characterName}を神推し！` : '神推し！'
        toast.success(label, {
          classNames: {
            toast: 'text-foreground',
            description: 'text-foreground! font-semibold!',
            icon: 'text-favorite'
          },
          icon: <Heart className='fill-current' />
        })
      }
    })
  }

  return (
    <>
      <Button
        size='sm'
        variant='ghost'
        onClick={handleToggle}
        aria-pressed={favored}
        aria-label={favored ? 'お気に入り解除' : 'お気に入り登録'}
        disabled={pending}
        className={cn(
          'h-8 w-8 p-0 rounded-full',
          favored ? 'bg-favorite/10 text-favorite hover:bg-favorite/15' : 'text-muted-foreground hover:text-favorite'
        )}
      >
        <motion.span
          initial={false}
          animate={favored ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className='inline-flex items-center justify-center'
        >
          <Heart className={cn('h-4 w-4', favored && 'fill-favorite/40')} />
        </motion.span>
      </Button>
      <FavoriteBurst triggerKey={burstKey} />
    </>
  )
}
