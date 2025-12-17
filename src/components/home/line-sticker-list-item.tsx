import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type LineStickerListItemProps = {
  url: string
  title: string
  description: string
  delay: number
}

/**
 * LINEスタンプリストアイテム
 */
export const LineStickerListItem = ({ url, title, description, delay }: LineStickerListItemProps) => {
  return (
    <motion.a
      href={url}
      target='_blank'
      rel='noopener noreferrer'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className='block'
    >
      <div className='bg-white rounded-lg p-4 shadow-sm border-2 border-[#00B900]/20 hover:border-[#00B900]/50 transition-all h-full'>
        <div className='flex items-start gap-3'>
          <Avatar className='h-10 w-10 shrink-0'>
            <AvatarImage src='/icons/line.png' alt='LINE' />
            <AvatarFallback className='bg-[#00B900] text-white'>L</AvatarFallback>
          </Avatar>
          <div className='flex-1 min-w-0'>
            <h3 className='text-sm font-bold text-gray-900 mb-0.5'>{title}</h3>
            <p className='text-xs text-gray-600 leading-tight'>{description}</p>
          </div>
        </div>
      </div>
    </motion.a>
  )
}
