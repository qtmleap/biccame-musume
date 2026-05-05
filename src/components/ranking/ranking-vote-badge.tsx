import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { lastVoteTimesAtom } from '@/atoms/vote-atom'
import { VoteBurst } from '@/components/characters/vote-burst'
import { useVote } from '@/hooks/use-vote'
import { cn } from '@/lib/utils'

type RankingVoteBadgeProps = {
  characterId: string
  voteCount: number
}

/**
 * ランキングカードの票数バッジ兼投票ボタン
 * - 未投票: 押すと投票（楽観的にカウント +1 表示）
 * - 投票済み: disabled で fill 状態
 */
export const RankingVoteBadge = ({ characterId, voteCount }: RankingVoteBadgeProps) => {
  const { mutate, isPending, isSuccess, data, error } = useVote(characterId)
  const [lastVoteTimes, setLastVoteTimes] = useAtom(lastVoteTimesAtom)
  const [burstKey, setBurstKey] = useState<number | null>(null)
  const [optimisticBump, setOptimisticBump] = useState(0)

  const hasVotedToday = useMemo(() => {
    const last = lastVoteTimes[characterId]
    if (!last) return false
    const nextDay = dayjs(last).add(1, 'day').startOf('day')
    return dayjs().isBefore(nextDay)
  }, [lastVoteTimes, characterId])

  useEffect(() => {
    if (isSuccess) {
      setLastVoteTimes((prev) => ({ ...prev, [characterId]: dayjs().toISOString() }))
      setBurstKey(Date.now())
      setOptimisticBump((n) => n + 1)
      if (data?.message) {
        toast.success(data.message, {
          classNames: { toast: 'text-foreground', description: 'text-foreground! font-semibold!' }
        })
      }
    }
  }, [isSuccess, data, characterId, setLastVoteTimes])

  useEffect(() => {
    if (error) {
      let message = '投票に失敗しちゃった…'
      try {
        // biome-ignore lint/suspicious/noExplicitAny: エラーレスポンス形が動的
        const errorData = (error as any)?.response?.data
        if (errorData?.message) message = errorData.message
        else if (error.message) message = error.message
      } catch {
        // noop
      }
      toast.error(message, { classNames: { toast: 'text-foreground' } })
    }
  }, [error])

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (hasVotedToday || isPending) return
    mutate()
  }

  const displayCount = (voteCount + optimisticBump).toLocaleString()
  const disabled = hasVotedToday || isPending

  return (
    <span className='relative inline-block'>
      <motion.button
        type='button'
        onClick={handleClick}
        whileTap={!disabled ? { scale: 0.93 } : undefined}
        disabled={disabled}
        aria-pressed={hasVotedToday}
        aria-label={hasVotedToday ? '本日投票済み' : '投票する'}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-favorite focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          hasVotedToday
            ? 'bg-vote-count text-vote-count-foreground border-card-border cursor-not-allowed'
            : 'bg-vote-count text-vote-count-foreground border-card-border hover:bg-favorite/10 hover:border-favorite/50 hover:text-favorite cursor-pointer'
        )}
      >
        <Heart
          className={cn(
            'h-4 w-4 transition-colors',
            hasVotedToday ? 'text-vote-count-icon fill-current' : 'text-vote-count-icon'
          )}
        />
        <span
          className='tabular-nums text-sm whitespace-nowrap'
          style={{ fontFamily: '"Zen Maru Gothic", sans-serif', fontWeight: 700 }}
        >
          {displayCount}
        </span>
      </motion.button>
      <VoteBurst triggerKey={burstKey} count={5} />
    </span>
  )
}
