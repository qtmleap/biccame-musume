import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { CircleCheckIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { lastVoteTimesAtom } from '@/atoms/voteAtom'
import { Button } from '@/components/ui/button'
import { useVote } from '@/hooks/useVote'
import { cn } from '@/lib/utils'

type CharacterVoteButtonProps = {
  characterId: string
  characterName?: string
  variant?: 'default' | 'compact'
}

/**
 * キャラクター投票ボタン
 */
export const CharacterVoteButton = ({
  characterId,
  characterName: _characterName,
  variant = 'default'
}: CharacterVoteButtonProps) => {
  const { vote, isVoting, isSuccess, error, voteResponse } = useVote(characterId)
  const [lastVoteTimes, setLastVoteTimes] = useAtom(lastVoteTimesAtom)

  // 今日既に投票済みかチェック
  const hasVotedToday = useMemo(() => {
    const lastVoteTime = lastVoteTimes[characterId]
    if (!lastVoteTime) return false

    const lastVote = dayjs(lastVoteTime)
    const now = dayjs()
    // 最後の投票から翌日（次の日の0時）になっているかチェック
    const nextDay = lastVote.add(1, 'day').startOf('day')
    return now.isBefore(nextDay)
  }, [lastVoteTimes, characterId])

  // 投票成功時に最後の投票時間を記録
  useEffect(() => {
    if (isSuccess) {
      setLastVoteTimes((prev) => ({
        ...prev,
        [characterId]: new Date().toISOString()
      }))
    }
  }, [isSuccess, characterId, setLastVoteTimes])

  useEffect(() => {
    if (isSuccess && voteResponse?.message) {
      toast.success(voteResponse.message, {
        classNames: {
          toast: 'text-gray-900',
          description: 'text-gray-900! font-semibold!',
          icon: 'text-green-600'
        },
        icon: <CircleCheckIcon />
      })
    }
  }, [isSuccess, voteResponse])

  useEffect(() => {
    if (error) {
      // エラーレスポンスからメッセージを取得
      const errorMessage = error.message

      toast.error(errorMessage, {
        classNames: {
          toast: 'text-gray-900',
          description: 'text-gray-900!'
        }
      })
    }
  }, [error])

  const handleVote = () => {
    if (hasVotedToday || isVoting) return
    vote()
  }

  const getButtonText = () => {
    if (hasVotedToday) return '応援済み'
    if (isVoting) return '応援中...'
    return '応援する'
  }

  if (variant === 'compact') {
    return (
      <Button
        size='sm'
        onClick={handleVote}
        disabled={hasVotedToday || isVoting}
        className={cn(
          'rounded-full text-xs font-semibold h-7 px-4',
          hasVotedToday
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
      disabled={hasVotedToday || isVoting}
      className={cn(
        'w-full font-semibold',
        hasVotedToday ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-[#e50012] hover:bg-[#c40010] text-white'
      )}
    >
      {getButtonText()}
    </Button>
  )
}
