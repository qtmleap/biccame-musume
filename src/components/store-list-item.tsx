import { MapPin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type StoreListItemProps = {
  character: StoreData
}

/**
 * 店舗一覧用のコンパクトな表示コンポーネント
 */
export const StoreListItem = ({ character }: StoreListItemProps) => {
  const imageUrl = character.character?.image_url

  return (
    <div className='flex items-center gap-3 p-2'>
      {/* アバター画像 */}
      <Avatar className='w-12 h-12'>
        <AvatarImage
          src={imageUrl}
          alt={character.character?.name || ''}
          className='object-cover mix-blend-multiply dark:mix-blend-screen'
        />
        <AvatarFallback className='bg-gray-200 dark:bg-gray-700'>
          <MapPin className='w-4 h-4 text-gray-500 dark:text-gray-400' />
        </AvatarFallback>
      </Avatar>

      {/* 店舗情報 */}
      <div className='flex-1 min-w-0'>
        <h3 className='font-semibold text-sm text-gray-900 dark:text-gray-100 truncate'>
          {getDisplayName(character.character?.name || '')}
        </h3>
        {character.address && <p className='text-xs text-gray-600 dark:text-gray-400 truncate'>{character.address}</p>}
      </div>
    </div>
  )
}
