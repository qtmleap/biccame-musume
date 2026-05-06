import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { lastVoteTimesAtom } from '@/atoms/vote-atom'
import { VoteBurst } from '@/components/characters/vote-burst'
import { Button } from '@/components/ui/button'
import { useBulkVote } from '@/hooks/use-bulk-vote'
import { STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'

type BulkVoteButtonProps = {
  characterIds: string[]
  /// 表示ラベル例: 「推し全員に投票」「ビッカメ娘全員に投票」
  label: string
  /// 押下後ラベル（全員済の場合の補助表示）
  votedLabel?: string
  className?: string
}

/**
 * 一括投票ボタン
 * - 渡された characterIds 全員が本日投票済みなら disabled
 */
export const BulkVoteButton = ({
  characterIds,
  label,
  votedLabel = '本日は投票済み',
  className
}: BulkVoteButtonProps) => {
  const { mutate, isPending, isSuccess, data, error } = useBulkVote()
  const lastVoteTimes = useAtomValue(lastVoteTimesAtom)
  const [burstKey, setBurstKey] = useState<number | null>(null)

  // ローカル localStorage 上で全員投票済みかどうか
  const allVotedToday = useMemo(() => {
    if (characterIds.length === 0) return true
    if (import.meta.env.DEV) return false
    return characterIds.every((id) => {
      const last = lastVoteTimes[id]
      if (!last) return false
      const nextDay = dayjs(last).add(1, 'day').startOf('day')
      return dayjs().isBefore(nextDay)
    })
  }, [characterIds, lastVoteTimes])

  useEffect(() => {
    if (!isSuccess || !data) return
    if (data.votedCount === 0) {
      toast.info('全員すでに本日の投票済みだよ', {
        classNames: { toast: 'text-foreground' }
      })
      return
    }
    setBurstKey(Date.now())
    const skip = data.skippedCount > 0 ? `（${data.skippedCount}人は本日投票済み）` : ''
    toast.success(`${data.votedCount}人に投票したよ！${skip}`, {
      classNames: {
        toast: 'text-foreground',
        description: 'text-foreground! font-semibold!'
      }
    })
  }, [isSuccess, data])

  useEffect(() => {
    if (error) {
      toast.error('投票に失敗しちゃった…', {
        classNames: { toast: 'text-foreground' }
      })
    }
  }, [error])

  const disabled = isPending || allVotedToday || characterIds.length === 0
  const buttonText = isPending ? '投票中...' : allVotedToday ? votedLabel : label

  return (
    <span className='relative inline-block'>
      <motion.span
        className='inline-block'
        style={!disabled ? { filter: STICKER_SHADOW_SM } : undefined}
        whileHover={!disabled ? { scale: 1.04 } : undefined}
        whileTap={!disabled ? { scale: 0.96 } : undefined}
        transition={STICKER_HOVER_TRANSITION}
      >
        <Button
          onClick={() => {
            if (disabled) return
            mutate(characterIds)
          }}
          disabled={disabled}
          className={cn(
            'h-10 px-5 rounded-full text-sm font-semibold gap-2',
            allVotedToday
              ? 'bg-button-disabled text-button-disabled-foreground border border-button-disabled-border hover:bg-button-disabled disabled:opacity-100 cursor-not-allowed'
              : 'bg-brand text-brand-foreground hover:bg-brand/90',
            className
          )}
        >
          <Heart className={cn('h-4 w-4', allVotedToday && 'fill-current')} />
          {buttonText}
        </Button>
      </motion.span>
      <VoteBurst triggerKey={burstKey} count={8} />
    </span>
  )
}
