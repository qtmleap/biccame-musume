import { Link } from '@tanstack/react-router'
import { ChevronRight, Store, Twitter } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Character } from '@/schemas/character.dto'

type CharacterListCardProps = {
  character: Character
}

/**
 * ビッカメ娘一覧表示用コンパクトカードコンポーネント
 */
export const CharacterListCard = ({ character }: CharacterListCardProps) => {
  const handleTwitterClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (character.twitter_url) {
      window.open(character.twitter_url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Link to='/characters/$id' params={{ id: character.key }} className='block h-full'>
      <div className='h-full rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer p-4'>
        <div className='flex items-center gap-3'>
          <Avatar className='h-16 w-16 border-2 border-primary'>
            <AvatarImage
              src={character.image_urls?.[1] || character.image_urls?.[0]}
              alt={character.character_name}
            />
            <AvatarFallback>{character.character_name[0]}</AvatarFallback>
          </Avatar>
          <div className='flex-1 min-w-0'>
            <h3 className='text-lg font-semibold mb-1 truncate'>{character.character_name}</h3>
            <div className='flex items-center gap-1 text-sm text-muted-foreground mb-2'>
              <Store className='h-3 w-3' />
              <span className='truncate'>{character.store_name}</span>
            </div>
            <div className='flex items-center gap-2'>
              {character.address && (
                <Badge variant='secondary' className='text-xs'>
                  {character.address.split(/都|道|府|県/)[0]}
                  {character.address.match(/都|道|府|県/)?.[0]}
                </Badge>
              )}
              {character.twitter_url && (
                <Button
                  size='sm'
                  variant='outline'
                  className='h-6 px-2 text-xs'
                  onClick={handleTwitterClick}
                >
                  <Twitter className='h-3 w-3 mr-1' />
                  フォロー
                </Button>
              )}
            </div>
          </div>
          <ChevronRight className='h-5 w-5 text-muted-foreground shrink-0' />
        </div>
      </div>
    </Link>
  )
}
