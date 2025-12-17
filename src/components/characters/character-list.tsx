import { LayoutGroup } from 'motion/react'
import { CharacterListCard } from '@/components/character-list-card'
import type { Character } from '@/schemas/character.dto'

type CharacterListProps = {
  characters: Character[]
}

/**
 * キャラクター一覧グリッド
 */
export const CharacterList = ({ characters }: CharacterListProps) => {
  return (
    <LayoutGroup>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
        {characters.map((character) => (
          <CharacterListCard key={character.key} character={character} />
        ))}
      </div>
    </LayoutGroup>
  )
}
