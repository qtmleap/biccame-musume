import { Calendar, ExternalLink, MapPin, Store, Twitter } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Character } from '@/schemas/character.dto'

type CharacterCardProps = {
  character: Character
}

/**
 * ビッカメ娘キャラクター情報カードコンポーネント
 */
export const CharacterCard = ({ character }: CharacterCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date)
  }

  return (
    <Card className='overflow-hidden hover:shadow-lg transition-shadow duration-300'>
      <CardHeader className='pb-4'>
        <div className='flex items-start gap-4'>
          <Avatar className='h-20 w-20 border-2 border-primary'>
            <AvatarImage src={character.image_urls?.[1] || character.image_urls?.[0]} alt={character.character_name} />
            <AvatarFallback>{character.character_name[0]}</AvatarFallback>
          </Avatar>
          <div className='flex-1 min-w-0'>
            <CardTitle className='text-xl mb-1'>{character.character_name}</CardTitle>
            <CardDescription className='flex items-center gap-1'>
              <Store className='h-3 w-3' />
              {character.store_name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground leading-relaxed'>{character.description}</p>

        <div className='space-y-2 text-sm'>
          {character.character_birthday && (
            <div className='flex items-start gap-2'>
              <Calendar className='h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0' />
              <div className='flex-1'>
                <div className='font-medium'>キャラクター誕生日</div>
                <div className='text-muted-foreground'>{formatDate(character.character_birthday)}</div>
              </div>
            </div>
          )}

          {character.store_birthday && (
            <div className='flex items-start gap-2'>
              <Store className='h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0' />
              <div className='flex-1'>
                <div className='font-medium'>店舗開店日</div>
                <div className='text-muted-foreground'>{formatDate(character.store_birthday)}</div>
              </div>
            </div>
          )}

          {character.address && (
            <div className='flex items-start gap-2'>
              <MapPin className='h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0' />
              <div className='flex-1'>
                <div className='font-medium'>住所</div>
                <div className='text-muted-foreground'>
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
              <Badge variant='outline' className='hover:bg-accent cursor-pointer'>
                <Twitter className='h-3 w-3 mr-1' />
                Twitter
              </Badge>
            </a>
          )}
          <a href={character.detail_url} target='_blank' rel='noopener noreferrer' className='inline-flex'>
            <Badge variant='outline' className='hover:bg-accent cursor-pointer'>
              <ExternalLink className='h-3 w-3 mr-1' />
              詳細ページ
            </Badge>
          </a>
          {character.store_link && (
            <a href={character.store_link} target='_blank' rel='noopener noreferrer' className='inline-flex'>
              <Badge variant='outline' className='hover:bg-accent cursor-pointer'>
                <Store className='h-3 w-3 mr-1' />
                店舗情報
              </Badge>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
