import dayjs from 'dayjs'
import { CircleCheckIcon } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useVote } from '@/hooks/useVote'
import { cn } from '@/lib/utils'

type CharacterVoteButtonProps = {
  characterId: string
  variant?: 'default' | 'compact'
}

/**
 * キャラクター投票ボタン
 */
export const CharacterVoteButton = ({ characterId, variant = 'default' }: CharacterVoteButtonProps) => {
  const { vote, isVoting, isSuccess, error, nextVoteDate } = useVote(characterId)

  useEffect(() => {
    if (isSuccess && nextVoteDate) {
      toast.success('投票ありがとうございます！', {
        description: `次回投票: ${dayjs(nextVoteDate).format('M月D日 0:00')}`,
        classNames: {
          toast: 'text-gray-900',
          description: 'text-gray-900! font-semibold!',
          icon: 'text-green-600'
        },
        icon: <CircleCheckIcon className='size-6 stroke-2' />
      })
    }
  }, [isSuccess, nextVoteDate])

  useEffect(() => {
    if (error) {
      toast.error('投票できませんでした', {
        description: error.message,
        classNames: {
          toast: 'text-gray-900',
          description: 'text-gray-900!'
        }
      })
    }
  }, [error])

  const handleVote = () => {
    if (isSuccess || isVoting) return
    vote()
  }

  const getButtonText = () => {
    if (isSuccess) return '投票済み'
    if (isVoting) return '投票中...'
    return '応援する'
  }

  if (variant === 'compact') {
    return (
      <Button
        size='sm'
        onClick={handleVote}
        disabled={isSuccess || isVoting}
        className={cn(
          'rounded-full text-xs w-full',
          isSuccess
            ? 'bg-gray-200 text-gray-600 cursor-not-allowed hover:bg-gray-200'
            : 'bg-[#e50012] text-white hover:bg-[#c40010]'
        )}
      >
        {getButtonText()}
      </Button>
    )
  }

  return (
    <Button
      onClick={handleVote}
      disabled={isSuccess || isVoting}
      className={cn(
        'w-full',
        isSuccess ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-[#e50012] hover:bg-[#c40010] text-white'
      )}
    >
      {getButtonText()}
    </Button>
  )
}
