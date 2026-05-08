import { UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type CharacterFollowButtonProps = {
  twitterId?: string
  iconOnly?: boolean
}

/**
 * ビッカメ娘のフォローボタンコンポーネント
 */
export const CharacterFollowButton = ({ twitterId, iconOnly = false }: CharacterFollowButtonProps) => {
  if (!twitterId) return null

  const href = `https://twitter.com/intent/follow?screen_name=${twitterId}`

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            size='icon'
            variant='outline'
            className='h-8 w-8 rounded-full border-brand/50 text-brand hover:bg-brand/10 hover:text-brand'
            aria-label='フォロー'
          >
            <a href={href} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()}>
              <UserRoundPlus className='h-4 w-4' />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>X (Twitter) でフォロー</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Button
      asChild
      size='sm'
      variant='secondary'
      className={cn(
        'h-8 px-3 rounded-full text-xs border border-brand/50 bg-button-surface text-brand hover:bg-brand/10 hover:text-brand'
      )}
    >
      <a href={href} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()}>
        フォロー
      </a>
    </Button>
  )
}
