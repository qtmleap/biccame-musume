import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Store } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { Character } from '@/schemas/character.dto'

type CharacterListCardProps = {
  character: Character
}

/**
 * ビッカメ娘一覧表示用コンパクトカードコンポーネント
 */
export const CharacterListCard = ({ character }: CharacterListCardProps) => {
  const isGraduated = !character.twitter_url

  return (
    <motion.div
      layout
      layoutId={character.key}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        layout: { type: 'spring', stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 }
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to='/characters/$id' params={{ id: character.key }} className='block h-full'>
        <div
          className={`h-full rounded-lg border shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer p-4 ${
            isGraduated
              ? 'border-gray-300 bg-gray-200/90 hover:bg-gray-200 hover:border-gray-400'
              : 'border-pink-200/40 bg-white/80 hover:bg-white/90 hover:border-pink-400/60'
          }`}
        >
          <div className='flex items-center gap-3'>
            <Avatar className={`h-16 w-16 border-2 ${isGraduated ? 'border-gray-400' : 'border-pink-400'}`}>
              <AvatarImage
                src={character.image_urls?.[1] || character.image_urls?.[0]}
                alt={character.character_name}
              />
              <AvatarFallback className={isGraduated ? 'bg-gray-200 text-gray-600' : 'bg-pink-100 text-pink-700'}>
                {character.character_name[0]}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <h3 className='text-lg font-semibold mb-2 truncate text-gray-800'>{character.character_name}</h3>
              <div className='flex items-center gap-1 text-sm text-gray-600 mb-2'>
                <Store className='h-3 w-3' />
                <span className='truncate'>{character.store_name}</span>
              </div>
              <div className='flex items-center gap-2 min-h-6'>
                {character.address && (
                  <Badge variant='secondary' className='text-xs bg-blue-100 text-blue-700 border-blue-200'>
                    {character.address.split(/都|道|府|県/)[0]}
                    {character.address.match(/都|道|府|県/)?.[0]}
                  </Badge>
                )}
                {character.character_birthday && (
                  <Badge variant='secondary' className='text-xs bg-pink-100 text-pink-700 border-pink-200'>
                    {dayjs(character.character_birthday).format('M月D日')}
                  </Badge>
                )}
                {isGraduated && (
                  <Badge variant='secondary' className='text-xs bg-gray-200 text-gray-600 border-gray-300'>
                    卒業
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
