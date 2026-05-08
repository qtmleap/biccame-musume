import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { CircleCheckIcon, PartyPopper } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { lastVoteTimesAtom } from '@/atoms/vote-atom'
import { VoteBurst } from '@/components/characters/vote-burst'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useVote } from '@/hooks/use-vote'
import { cn } from '@/lib/utils'
import { VOTE_LABELS } from '@/locales/app.content'

type CharacterVoteButtonProps = {
  characterId: string
  characterName?: string
  variant?: 'default' | 'compact'
  enableVoteCount?: boolean
  isBiccameMusume?: boolean
  /** アイコンのみ表示（一覧などコンパクト表示用） */
  iconOnly?: boolean
}

/**
 * キャラクター投票ボタン
 */
export const CharacterVoteButton = ({
  characterId,
  characterName: _characterName,
  variant = 'default',
  isBiccameMusume = true,
  iconOnly = false
}: CharacterVoteButtonProps) => {
  const { mutate, isPending, isSuccess, data, error } = useVote(characterId)
  const [lastVoteTimes, setLastVoteTimes] = useAtom(lastVoteTimesAtom)
  const [burstKey, setBurstKey] = useState<number | null>(null)

  // 今日既に投票済みかチェック
  const hasVotedToday = useMemo(() => {
    if (import.meta.env.DEV) return false
    const lastVoteTime = lastVoteTimes[characterId]
    if (!lastVoteTime) return false

    const lastVote = dayjs(lastVoteTime)
    const currentTime = dayjs()
    // 最後の投票から翌日（次の日の0時）になっているかチェック
    const nextDay = lastVote.add(1, 'day').startOf('day')
    return currentTime.isBefore(nextDay)
  }, [lastVoteTimes, characterId])

  // 投票成功時に最後の投票時間を記録 + バースト発火
  useEffect(() => {
    if (isSuccess) {
      setLastVoteTimes((prev) => ({
        ...prev,
        [characterId]: dayjs().toISOString()
      }))
      setBurstKey(Date.now())
    }
  }, [isSuccess, characterId, setLastVoteTimes])

  useEffect(() => {
    if (isSuccess && data?.message) {
      toast.success(data.message, {
        classNames: {
          toast: 'text-foreground',
          description: 'text-foreground! font-semibold!',
          icon: 'text-success'
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
          toast: 'text-foreground',
          description: 'text-foreground!'
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

  const stateClass = hasVotedToday
    ? 'bg-button-disabled text-button-disabled-foreground border border-button-disabled-border cursor-not-allowed disabled:opacity-100 hover:bg-button-disabled'
    : 'bg-brand hover:bg-brand/90 text-brand-foreground'

  if (iconOnly) {
    return (
      <span className='relative inline-block'>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.span whileTap={!hasVotedToday ? { scale: 0.9 } : undefined} className='inline-block'>
              <Button
                size='icon'
                variant={hasVotedToday ? 'secondary' : 'default'}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleVote()
                }}
                aria-disabled={hasVotedToday || isPending}
                disabled={isPending}
                aria-label={getButtonText()}
                className={cn('h-8 w-8 rounded-full', stateClass)}
              >
                <PartyPopper className={cn('h-4 w-4', hasVotedToday && 'fill-current')} />
              </Button>
            </motion.span>
          </TooltipTrigger>
          <TooltipContent>{hasVotedToday ? '本日は応援済み（明日また応援できる）' : '今日の応援を送る'}</TooltipContent>
        </Tooltip>
        <VoteBurst triggerKey={burstKey} count={4} />
      </span>
    )
  }

  if (variant === 'compact') {
    return (
      <span className='relative inline-block'>
        <motion.span whileTap={{ scale: 0.92 }} className='inline-block'>
          <Button
            size='sm'
            variant={hasVotedToday ? 'secondary' : 'default'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleVote()
            }}
            aria-disabled={hasVotedToday || isPending}
            disabled={isPending}
            className={cn('h-8 px-3 rounded-full text-xs', stateClass)}
          >
            {getButtonText()}
          </Button>
        </motion.span>
        <VoteBurst triggerKey={burstKey} count={4} />
      </span>
    )
  }

  return (
    <span className='relative block'>
      <motion.span whileTap={{ scale: 0.96 }} className='block'>
        <Button
          variant={hasVotedToday ? 'secondary' : 'default'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleVote()
          }}
          aria-disabled={hasVotedToday || isPending}
          disabled={isPending}
          className={cn('w-full h-9 rounded-full text-xs font-semibold', stateClass)}
        >
          {getButtonText()}
        </Button>
      </motion.span>
      <VoteBurst triggerKey={burstKey} count={6} />
    </span>
  )
}
