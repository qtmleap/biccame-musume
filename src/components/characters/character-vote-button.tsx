import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { CircleCheckIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { lastVoteTimesAtom } from '@/atoms/vote-atom'
import { Button } from '@/components/ui/button'
import { useVote } from '@/hooks/use-vote'
import { cn } from '@/lib/utils'
import { VOTE_LABELS } from '@/locales/app.content'

type CharacterVoteButtonProps = {
  characterId: string
  characterName?: string
  variant?: 'default' | 'compact'
  enableVoteCount?: boolean
  isBiccameMusume?: boolean
}

/**
 * キャラクター投票ボタン
 */
export const CharacterVoteButton = ({
  characterId,
  characterName: _characterName,
  variant = 'default',
  isBiccameMusume = true
}: CharacterVoteButtonProps) => {
  const { mutate, isPending, isSuccess, data, error } = useVote(characterId)
  const [lastVoteTimes, setLastVoteTimes] = useAtom(lastVoteTimesAtom)

  // 今日既に投票済みかチェック
  const hasVotedToday = useMemo(() => {
    const lastVoteTime = lastVoteTimes[characterId]
    if (!lastVoteTime) return false

    const lastVote = dayjs(lastVoteTime)
    const currentTime = dayjs()
    // 最後の投票から翌日（次の日の0時）になっているかチェック
    const nextDay = lastVote.add(1, 'day').startOf('day')
    return currentTime.isBefore(nextDay)
  }, [lastVoteTimes, characterId])

  // 投票成功時に最後の投票時間を記録
  useEffect(() => {
    if (isSuccess) {
      setLastVoteTimes((prev) => ({
        ...prev,
        [characterId]: dayjs().toISOString()
      }))
    }
  }, [isSuccess, characterId, setLastVoteTimes])

  useEffect(() => {
    if (isSuccess && data?.message) {
      toast.success(data.message, {
        classNames: {
          toast: 'text-gray-900',
          description: 'text-gray-900! font-semibold!',
          icon: 'text-green-600'
        },
        icon: <CircleCheckIcon />
      })
    }
  }, [isSuccess, data])

  useEffect(() => {
    if (error) {
      // エラーレスポンスからメッセージを取得
      let errorMessage = VOTE_LABELS.error

      try {
        // biome-ignore lint/suspicious/noExplicitAny: エラーオブジェクトの型が不明なため
        const errorData = (error as any)?.response?.data
        if (errorData?.message) {
          errorMessage = errorData.message
        } else {
          errorMessage = error.message
        }
      } catch {
        errorMessage = error.message
      }

      toast.error(errorMessage, {
        classNames: {
          toast: 'text-gray-900',
          description: 'text-gray-900!'
        }
      })
    }
  }, [error])

  // ビッカメ娘でない場合は表示しない（hooksの後に配置）
  if (!isBiccameMusume) return null

  const handleVote = () => {
    if (hasVotedToday || isPending) return
    mutate()
  }

  const getButtonText = () => {
    if (hasVotedToday) return VOTE_LABELS.voted
    if (isPending) return '応援中...'
    return VOTE_LABELS.vote
  }

  if (variant === 'compact') {
    return (
      <Button
        size='sm'
        onClick={(e) => {
          e.stopPropagation()
          handleVote()
        }}
        disabled={hasVotedToday || isPending}
        className={cn(
          'rounded-full px-4 h-7 text-xs font-semibold',
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
      onClick={(e) => {
        e.stopPropagation()
        handleVote()
      }}
      disabled={hasVotedToday || isPending}
      className={cn(
        'w-full font-semibold',
        hasVotedToday ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-[#e50012] hover:bg-[#c40010] text-white'
      )}
    >
      {getButtonText()}
    </Button>
  )
}
