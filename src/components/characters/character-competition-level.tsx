import { CalendarCheck, CalendarClock, Flame, Hourglass, type LucideIcon, Package, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { InfoItem } from '@/components/characters/detail/store-info-items'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useEvents } from '@/hooks/use-events'
import { DURATION, FADE_IN } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { StoreKey } from '@/schemas/store.dto'
import { type CompetitionLevel, calculateCompetitionStats } from '@/utils/competition-level'

type CharacterCompetitionLevelProps = {
  storeKey: StoreKey
}

const LEVEL_STYLE: Record<CompetitionLevel, string> = {
  'SS+': 'bg-heat-ss-plus text-heat-ss-plus-foreground',
  SS: 'bg-heat-ss text-heat-ss-foreground',
  S: 'bg-heat-s text-heat-s-foreground',
  A: 'bg-heat-a text-heat-a-foreground',
  B: 'bg-heat-b text-heat-b-foreground',
  C: 'bg-heat-c text-heat-c-foreground',
  D: 'bg-heat-d text-heat-d-foreground'
}

/** 上位ほど急ぎを示すアイコン。下位は落ち着いた表現にする */
const LEVEL_ICON: Record<CompetitionLevel, LucideIcon> = {
  'SS+': Flame,
  SS: Flame,
  S: Zap,
  A: Hourglass,
  B: Hourglass,
  C: CalendarCheck,
  D: CalendarCheck
}

const LEVEL_DESCRIPTION: Record<CompetitionLevel, string> = {
  'SS+': '初日の朝いちばんが狙い目です。事前に開店時刻を調べて、前もって予定を空けておきましょう。',
  SS: '初日に行けるよう予定を立てておくと安心です。開店時刻の確認をおすすめします。',
  S: '最初の数日が狙い目です。週末をまたぐ場合は早めに動きましょう。',
  A: '最初の一週間のうちに行けると確実です。',
  B: '二週間ほどの間に立ち寄れば大丈夫そうです。',
  C: '一ヶ月ほど余裕があります。ゆっくり計画を立てられます。',
  D: 'じっくり配られています。都合のいい日に立ち寄れます。'
}

/**
 * 対象ビッカメ娘の限定配布がどれくらいの速さでなくなるかを段階表示する
 */
export const CharacterCompetitionLevel = ({ storeKey }: CharacterCompetitionLevelProps) => {
  const { data: events } = useEvents()
  const stats = useMemo(() => calculateCompetitionStats(events, storeKey), [events, storeKey])

  if (!stats) return null

  const LevelIcon = LEVEL_ICON[stats.level]

  return (
    <motion.div
      key={`competition-${storeKey}`}
      variants={FADE_IN}
      initial='initial'
      animate='animate'
      transition={{ duration: DURATION.normal, delay: 0.3 }}
      className='space-y-3 mb-6'
    >
      <div className='flex items-center gap-2'>
        <h2 className='text-xl font-bold text-foreground'>激戦区レベル</h2>
        <Badge className={cn('gap-1 border-transparent', LEVEL_STYLE[stats.level])}>
          <LevelIcon className='size-3' />
          {stats.level}
        </Badge>
      </div>

      <p className='text-sm text-foreground'>{LEVEL_DESCRIPTION[stats.level]}</p>

      <Separator className='bg-separator' />

      <div className='space-y-3'>
        <InfoItem icon={CalendarClock} label='配布が終わるまで'>
          {stats.averageDays === undefined ? (
            <p className='text-sm text-foreground'>期間いっぱい配られました</p>
          ) : (
            <p className='text-sm text-foreground'>
              平均 {stats.averageDays < 1 ? '当日' : `${stats.averageDays.toFixed(1)}日`}
            </p>
          )}
        </InfoItem>

        <InfoItem icon={Package} label='1回あたりの配布数'>
          <p className='text-sm text-foreground'>平均 {stats.averageQuantity}個</p>
        </InfoItem>
      </div>

      <p className='text-xs text-muted-foreground'>
        限定数のある配布 {stats.sampleSize} 件をもとにしています。
        {stats.sampleSize === 1 && 'まだ実績が少ないので参考程度に。'}
      </p>
    </motion.div>
  )
}
