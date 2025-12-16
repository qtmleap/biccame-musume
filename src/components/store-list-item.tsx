import type { Character } from '@/schemas/character.dto'

type StoreListItemProps = {
  character: Character
}

/**
 * 店舗一覧用のコンパクトな表示コンポーネント
 */
export const StoreListItem = ({ character }: StoreListItemProps) => {
  const imageUrl = character.image_urls && character.image_urls.length > 0 ? character.image_urls[0] : null

  return (
    <div className='flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors'>
      {/* アバター画像 */}
      {imageUrl ? (
        <img src={imageUrl} alt={character.character_name} className='w-12 h-12 rounded-full object-cover shrink-0' />
      ) : (
        <div className='w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0 flex items-center justify-center'>
          <span className='text-xs text-gray-500 dark:text-gray-400'>📍</span>
        </div>
      )}

      {/* 店舗情報 */}
      <div className='flex-1 min-w-0'>
        <h3 className='font-semibold text-sm text-gray-900 dark:text-gray-100 truncate'>{character.character_name}</h3>
        {character.address && <p className='text-xs text-gray-600 dark:text-gray-400 truncate'>{character.address}</p>}
      </div>
    </div>
  )
}
