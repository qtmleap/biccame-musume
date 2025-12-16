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
  const isGraduated = !character.twitter_url

  const handleTwitterClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (character.twitter_url) {
      window.open(character.twitter_url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Link to='/characters/$id' params={{ id: character.key }} className='block h-full'>
      <div
        className={`h-full rounded-lg border shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer p-4 ${
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
            <h3 className='text-lg font-semibold mb-1 truncate text-gray-800'>{character.character_name}</h3>
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
              {isGraduated ? (
                <Badge variant='secondary' className='text-xs bg-gray-200 text-gray-600 border-gray-300'>
                  卒業
                </Badge>
              ) : (
                character.twitter_url && (
                  <Button
                    size='sm'
                    className='h-6 px-2 text-xs bg-blue-500 text-white hover:bg-blue-600 border-0'
                    onClick={handleTwitterClick}
                  >
                    <Twitter className='h-3 w-3 mr-1' />
                    フォロー
                  </Button>
                )
              )}
            </div>
          </div>
          <ChevronRight className='h-5 w-5 text-gray-400 shrink-0' />
        </div>
      </div>
    </Link>
  )
}
