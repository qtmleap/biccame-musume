import { Button } from '@/components/ui/button'

type CharacterFollowButtonProps = {
  twitterId?: string
}

/**
 * ビッカメ娘のフォローボタンコンポーネント
 */
export const CharacterFollowButton = ({ twitterId }: CharacterFollowButtonProps) => {
  if (!twitterId) return null

  return (
    <Button
      asChild
      size='sm'
      variant='outline'
      className='h-8 px-3 rounded-full text-xs border-brand/50 text-brand hover:bg-brand/10 hover:text-brand'
    >
      <a
        href={`https://twitter.com/intent/follow?screen_name=${twitterId}`}
        target='_blank'
        rel='noopener noreferrer'
        onClick={(e) => e.stopPropagation()}
      >
        フォロー
      </a>
    </Button>
  )
}
