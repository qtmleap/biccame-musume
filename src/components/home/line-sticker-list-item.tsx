import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { DURATION } from '@/lib/motion'
import { getStickerRotation, STICKER_HOVER_TRANSITION, STICKER_SHADOW_SM } from '@/lib/sticker'
import { cn } from '@/lib/utils'

type LineStickerListItemProps = {
  url: string
  title: string
  description: string
  index?: number
  delay: number
}

const TAPES: ({ side: 'left' | 'right'; color: string; angle: string } | null)[] = [
  { side: 'left', color: 'bg-yellow-200/80', angle: '-rotate-[12deg]' },
  { side: 'right', color: 'bg-pink-200/80', angle: 'rotate-[10deg]' },
  { side: 'left', color: 'bg-blue-200/80', angle: '-rotate-[8deg]' },
  null,
  { side: 'right', color: 'bg-green-200/80', angle: 'rotate-[8deg]' },
  null
]

/**
 * LINEスタンプリストアイテム
 */
export const LineStickerListItem = ({ url, title, description, index = 0, delay }: LineStickerListItemProps) => {
  const isMultiColumn = useMediaQuery('(min-width: 640px)')
  const rotationDeg = isMultiColumn ? getStickerRotation(index) : 0
  const tape = TAPES[index % TAPES.length]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, delay, ease: 'easeOut' }}
      className='h-full'
      style={{ filter: STICKER_SHADOW_SM }}
    >
      <motion.div
        className='h-full'
        style={{ rotate: rotationDeg }}
        whileHover={{ scale: 1.04, rotate: 0 }}
        whileTap={{ scale: 0.97 }}
        transition={STICKER_HOVER_TRANSITION}
      >
        <a
          href={url}
          target='_blank'
          rel='noopener noreferrer'
          className='relative block bg-card rounded-xl p-4 border border-zinc-200 dark:border-card-border h-full'
        >
          {tape && (
            <div
              aria-hidden
              className={cn(
                'absolute -top-1.5 w-8 h-3 rounded-sm',
                tape.color,
                tape.angle,
                tape.side === 'left' ? 'left-4' : 'right-4'
              )}
            />
          )}
          <div className='flex items-start gap-3'>
            <Avatar className='h-10 w-10'>
              <AvatarImage src='/icons/line.png' alt='LINE' />
              <AvatarFallback>L</AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <h3 className='text-sm font-bold text-foreground mb-0.5'>{title}</h3>
              <p className='text-xs text-muted-foreground leading-tight'>{description}</p>
            </div>
          </div>
        </a>
      </motion.div>
    </motion.div>
  )
}
