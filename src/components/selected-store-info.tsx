import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { StoreData } from '@/schemas/store.dto'
import { getDisplayName } from '@/utils/character'

type SelectedStoreInfoProps = {
  character: StoreData
}

/**
 * マップ上で選択された店舗情報を表示するコンパクトなコンポーネント
 */
export const SelectedStoreInfo = ({ character }: SelectedStoreInfoProps) => {
  return (
    <Link
      to='/characters/$id'
      params={{ id: character.id }}
      className='flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors -m-2 p-2'
    >
      {/* アバター */}
      <Avatar className='h-16 w-16 border-2 border-pink-400 shrink-0'>
        <AvatarImage src={character.character?.image_url} alt={character.character?.name || ''} />
        <AvatarFallback className='bg-pink-100 text-pink-700'>{character.character?.name?.[0] || '?'}</AvatarFallback>
      </Avatar>

      {/* 店舗情報 */}
      <div className='flex-1 min-w-0 space-y-1.5'>
        <div>
          <h3 className='text-sm font-semibold text-gray-800 dark:text-gray-100'>
            {getDisplayName(character.character?.name || '')}
          </h3>
        </div>

        {/* 住所情報 */}
        {character.store?.address && (
          <div className='text-xs space-y-0.5'>
            {character.postal_code && <div className='text-gray-500 dark:text-gray-400'>〒{character.postal_code}</div>}
            <div className='text-gray-700 dark:text-gray-300'>{character.store.address}</div>
          </div>
        )}
      </div>
    </Link>
  )
}
