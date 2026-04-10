import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { charactersQueryKey } from '@/hooks/use-characters'
import { client } from '@/utils/client'

export type UpdateOverlayStatus = 'clearing' | 'reloading'

type Props = {
  open: boolean
  status: UpdateOverlayStatus
}

const STATUS_MESSAGES: Record<UpdateOverlayStatus, string> = {
  clearing: 'キャッシュをクリアしています...',
  reloading: '最新版を読み込んでいます...'
}

type CharacterSlot = {
  id: string
  imageUrl: string
  top: string
  left: string
  size: number
  rotation: number
  delay: number
}

const AVOID_CENTER = { minX: 30, maxX: 70, minY: 30, maxY: 70 }

const isInCenter = (x: number, y: number) =>
  x > AVOID_CENTER.minX && x < AVOID_CENTER.maxX && y > AVOID_CENTER.minY && y < AVOID_CENTER.maxY

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

const pickPositionAvoidingCenter = (): { top: number; left: number } => {
  let top: number
  let left: number
  let attempts = 0
  do {
    top = randomInRange(5, 88)
    left = randomInRange(5, 88)
    attempts++
  } while (isInCenter(left, top) && attempts < 20)
  return { top, left }
}

export const UpdateOverlay = ({ open, status }: Props) => {
  const { data: characters } = useQuery({
    queryKey: charactersQueryKey,
    queryFn: () => client.getCharacters(),
    staleTime: 1000 * 60 * 5,
    enabled: open
  })

  const slots = useMemo<CharacterSlot[]>(() => {
    if (!open) return []
    const biccame = (characters ?? []).filter((c) => c.character?.is_biccame_musume === true)
    if (biccame.length === 0) return []

    const count = Math.min(biccame.length, Math.floor(randomInRange(6, 11)))
    const shuffled = [...biccame].sort(() => Math.random() - 0.5).slice(0, count)

    return shuffled.map((c, i) => {
      const { top, left } = pickPositionAvoidingCenter()
      const imageKey = c.character.images[Math.floor(Math.random() * c.character.images.length)]
      const imageUrl = new URL(imageKey, 'https://biccame.jp/profile/').href
      return {
        id: `${c.id}-${i}`,
        imageUrl,
        top: `${top}%`,
        left: `${left}%`,
        size: Math.floor(randomInRange(60, 121)),
        rotation: randomInRange(-15, 15),
        delay: i * 0.15
      }
    })
  }, [open, characters])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='update-overlay'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className='fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-md overflow-hidden'
        >
          {slots.map((slot) => (
            <motion.img
              key={slot.id}
              src={slot.imageUrl}
              alt=''
              width={slot.size}
              height={slot.size}
              className='absolute object-contain pointer-events-none select-none drop-shadow-lg'
              style={{
                top: slot.top,
                left: slot.left,
                rotate: slot.rotation
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 1.06, 0.97, 1.03, 1],
                opacity: 1,
                y: [0, -6, 0, -4, 0]
              }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                scale: {
                  type: 'spring',
                  stiffness: 260,
                  damping: 14,
                  delay: slot.delay
                },
                opacity: { duration: 0.2, delay: slot.delay },
                y: {
                  duration: 2.8,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                  delay: slot.delay + 0.5
                }
              }}
            />
          ))}

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className='relative z-10 flex flex-col items-center gap-4 text-center px-6'
          >
            <motion.img
              src='/icons/icon-192x192.png'
              alt='App icon'
              width={56}
              height={56}
              className='rounded-2xl shadow-md'
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
            <div className='flex flex-col items-center gap-1.5'>
              <p className='text-foreground text-base font-semibold drop-shadow-sm'>アップデート中</p>
              <p className='text-muted-foreground text-sm drop-shadow-sm'>{STATUS_MESSAGES[status]}</p>
            </div>
            <div className='flex gap-1.5'>
              {([0, 1, 2] as const).map((i) => (
                <motion.span
                  key={i}
                  className='h-2 w-2 rounded-full bg-primary'
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: i * 0.22, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
