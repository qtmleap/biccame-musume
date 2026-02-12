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
      className='rounded-full px-4 h-7 text-xs font-semibold bg-transparent text-gray-900 border border-gray-300 hover:bg-gray-100'
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
