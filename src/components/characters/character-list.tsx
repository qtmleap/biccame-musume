import { LayoutGroup } from 'motion/react'
import { CharacterListCard } from '@/components/character-list-card'
import type { StoreData } from '@/schemas/store.dto'

type CharacterListProps = {
  characters: StoreData[]
  title?: string
  showTitle?: boolean
}

/**
 * キャラクター一覧グリッド
 */
export const CharacterList = ({ characters, title, showTitle = false }: CharacterListProps) => {
  if (characters.length === 0) return null

  return (
    <div className='mb-8'>
      {showTitle && title && <h2 className='text-xl font-bold mb-4 text-gray-800 dark:text-gray-100'>{title}</h2>}
      <LayoutGroup>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
          {characters.map((character) => (
            <CharacterListCard key={character.id} character={character} />
          ))}
        </div>
      </LayoutGroup>
    </div>
  )
}
