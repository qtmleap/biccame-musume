import dayjs from 'dayjs'
import { Calendar, MapPin, Store, Twitter } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type CharacterCardProps = {
  character: StoreData
}

/**
 * ビッカメ娘キャラクター情報カードコンポーネント
 */
export const CharacterCard = ({ character }: CharacterCardProps) => {
  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('YYYY年M月D日')
  }

  const store = character.store

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
    >
      <Card className='overflow-hidden hover:shadow-lg transition-shadow duration-300 bg-white/80 border-pink-300/30'>
        <CardHeader className='pb-4 bg-linear-to-r from-pink-100/40 to-blue-100/40'>
          <div className='flex items-start gap-4'>
            <Avatar className='h-20 w-20 border-2 border-pink-400'>
              <AvatarImage src={character.character?.image_url} alt={character.character?.name || ''} />
              <AvatarFallback className='bg-pink-100 text-pink-700'>
                {character.character?.name?.[0] || '?'}
              </AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <CardTitle className='text-xl mb-1 text-gray-800'>
                {getDisplayName(character.character?.name || '')}
              </CardTitle>
              <CardDescription className='flex items-center gap-1 text-gray-600'>
                <Store className='h-3 w-3' />
                {store?.name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4 bg-white/70'>
          <p className='text-sm text-gray-700 leading-relaxed'>{character.character?.description}</p>

          <div className='space-y-2 text-sm'>
            {character.character?.birthday && (
              <div className='flex items-start gap-2'>
                <Calendar className='h-4 w-4 mt-0.5 text-pink-500 shrink-0' />
                <div className='flex-1'>
                  <div className='font-medium text-gray-800'>キャラクター誕生日</div>
                  <div className='text-gray-600'>{formatDate(character.character.birthday)}</div>
                </div>
              </div>
            )}

            {store?.birthday && (
              <div className='flex items-start gap-2'>
                <Store className='h-4 w-4 mt-0.5 text-blue-500 shrink-0' />
                <div className='flex-1'>
                  <div className='font-medium text-gray-800'>店舗開店日</div>
                  <div className='text-gray-600'>{formatDate(store.birthday)}</div>
                </div>
              </div>
            )}

            {store?.address && (
              <div className='flex items-start gap-2'>
                <MapPin className='h-4 w-4 mt-0.5 text-green-500 shrink-0' />
                <div className='flex-1'>
                  <div className='font-medium text-gray-800'>住所</div>
                  <div className='text-gray-600'>
                    {character.postal_code && `〒${character.postal_code}`}
                    {character.postal_code && <br />}
                    {store.address}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className='flex flex-wrap gap-2 pt-2'>
            {character.character?.twitter_id && (
              <a
                href={`https://x.com/${character.character.twitter_id}`}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex'
              >
                <Badge variant='outline' className='hover:bg-blue-50 cursor-pointer border-blue-300 text-blue-700'>
                  <Twitter className='h-3 w-3 mr-1' />
                  Twitter
                </Badge>
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
