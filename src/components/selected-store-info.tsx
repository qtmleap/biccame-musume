import { ExternalLink, MapPin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Character } from '@/schemas/character.dto'
import { getDisplayName } from '@/utils/character'

type SelectedStoreInfoProps = {
  character: Character
}

/**
 * マップ上で選択された店舗情報を表示するコンパクトなコンポーネント
 */
export const SelectedStoreInfo = ({ character }: SelectedStoreInfoProps) => {
  return (
    <div className='flex items-center gap-4'>
      {/* アバター */}
      <Avatar className='h-16 w-16 border-2 border-pink-400 shrink-0'>
        <AvatarImage src={character.image_urls?.[1] || character.image_urls?.[0]} alt={character.character_name} />
        <AvatarFallback className='bg-pink-100 text-pink-700'>{character.character_name[0]}</AvatarFallback>
      </Avatar>

      {/* 店舗情報 */}
      <div className='flex-1 min-w-0 space-y-1.5'>
        <div>
          <h3 className='text-sm font-semibold text-gray-800 dark:text-gray-100'>
            {getDisplayName(character.character_name)}
          </h3>
        </div>

        {/* 住所情報 */}
        {character.address && (
          <div className='flex items-start gap-1.5 text-xs'>
            <MapPin className='h-3 w-3 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0' />
            <div className='flex-1 min-w-0 space-y-0.5'>
              {character.zipcode && <div className='text-gray-500 dark:text-gray-400'>〒{character.zipcode}</div>}
              <div className='text-gray-700 dark:text-gray-300'>{character.address}</div>
            </div>
          </div>
        )}

        {/* 店舗詳細リンク */}
        {character.store_link && (
          <div>
            <a
              href={character.store_link}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline'
            >
              <ExternalLink className='h-3 w-3' />
              <span>店舗詳細を見る</span>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
