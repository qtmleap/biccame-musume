import dayjs from 'dayjs'
import { Calendar, ExternalLink, MapPin, Store, Twitter } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Character } from '@/schemas/character.dto'
import { getDisplayName } from '@/utils/character'

type CharacterCardProps = {
  character: Character
}

/**
 * ビッカメ娘キャラクター情報カードコンポーネント
 */
export const CharacterCard = ({ character }: CharacterCardProps) => {
  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('YYYY年M月D日')
  }

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
              <AvatarImage
                src={character.image_urls?.[1] || character.image_urls?.[0]}
                alt={character.character_name}
              />
              <AvatarFallback className='bg-pink-100 text-pink-700'>{character.character_name[0]}</AvatarFallback>
            </Avatar>
            <div className='flex-1 min-w-0'>
              <CardTitle className='text-xl mb-1 text-gray-800'>{getDisplayName(character.character_name)}</CardTitle>
              <CardDescription className='flex items-center gap-1 text-gray-600'>
                <Store className='h-3 w-3' />
                {character.store_name}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4 bg-white/70'>
          <p className='text-sm text-gray-700 leading-relaxed'>{character.description}</p>

          <div className='space-y-2 text-sm'>
            {character.character_birthday && (
              <div className='flex items-start gap-2'>
                <Calendar className='h-4 w-4 mt-0.5 text-pink-500 shrink-0' />
                <div className='flex-1'>
                  <div className='font-medium text-gray-800'>キャラクター誕生日</div>
                  <div className='text-gray-600'>{formatDate(character.character_birthday)}</div>
                </div>
              </div>
            )}

            {character.store_birthday && (
              <div className='flex items-start gap-2'>
                <Store className='h-4 w-4 mt-0.5 text-blue-500 shrink-0' />
                <div className='flex-1'>
                  <div className='font-medium text-gray-800'>店舗開店日</div>
                  <div className='text-gray-600'>{formatDate(character.store_birthday)}</div>
                </div>
              </div>
            )}

            {character.address && (
              <div className='flex items-start gap-2'>
                <MapPin className='h-4 w-4 mt-0.5 text-green-500 shrink-0' />
                <div className='flex-1'>
                  <div className='font-medium text-gray-800'>住所</div>
                  <div className='text-gray-600'>
                    {character.zipcode && `〒${character.zipcode}`}
                    {character.zipcode && <br />}
                    {character.address}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className='flex flex-wrap gap-2 pt-2'>
            {character.twitter_url && (
              <a href={character.twitter_url} target='_blank' rel='noopener noreferrer' className='inline-flex'>
                <Badge variant='outline' className='hover:bg-blue-50 cursor-pointer border-blue-300 text-blue-700'>
                  <Twitter className='h-3 w-3 mr-1' />
                  Twitter
                </Badge>
              </a>
            )}
            <a href={character.detail_url} target='_blank' rel='noopener noreferrer' className='inline-flex'>
              <Badge variant='outline' className='hover:bg-pink-50 cursor-pointer border-pink-300 text-pink-700'>
                <ExternalLink className='h-3 w-3 mr-1' />
                詳細ページ
              </Badge>
            </a>
            {character.store_link && (
              <a href={character.store_link} target='_blank' rel='noopener noreferrer' className='inline-flex'>
                <Badge variant='outline' className='hover:bg-green-50 cursor-pointer border-green-300 text-green-700'>
                  <Store className='h-3 w-3 mr-1' />
                  店舗情報
                </Badge>
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
