import { AnimatePresence, motion } from 'motion/react'

export type UpdateOverlayStatus = 'clearing' | 'reloading'

type Props = {
  open: boolean
  status: UpdateOverlayStatus
}

const STATUS_MESSAGES: Record<UpdateOverlayStatus, string> = {
  clearing: 'キャッシュをクリアしています...',
  reloading: '最新版を読み込んでいます...'
}

export const UpdateOverlay = ({ open, status }: Props) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='update-overlay'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className='fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-md'
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className='flex flex-col items-center gap-6 rounded-2xl border bg-card p-10 shadow-xl w-72'
          >
            <motion.img
              src='/icons/icon-192x192.png'
              alt='App icon'
              width={64}
              height={64}
              className='rounded-2xl'
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
            <div className='flex flex-col items-center gap-2 text-center'>
              <p className='text-foreground text-base font-semibold'>アップデート中</p>
              <p className='text-muted-foreground text-sm'>{STATUS_MESSAGES[status]}</p>
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
