import type { Meta, StoryObj } from '@storybook/react-vite'
import { CharacterList } from '@/components/characters/character-list'
import { CharacterProfileSection } from '@/components/characters/detail/character-profile-section'
import { characters } from '@/stories/catalogue-fixtures'
import { character } from '@/stories/fixtures'

const CharactersPreview = ({ detail = false }: { detail?: boolean }) =>
  detail ? (
    <div className='mx-auto max-w-3xl'>
      <CharacterProfileSection character={character} />
    </div>
  ) : (
    <div className='mx-auto max-w-6xl'>
      <CharacterList characters={characters} />
    </div>
  )

const meta = {
  title: 'Review/Characters',
  component: CharactersPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '現行のCharacterListとプロフィールを表示します。列数・地域表示は本番部品に従います。ページ全体はPages/Production/Charactersで確認できます。未ログイン状態で、応援はローカルモックのみです。'
      }
    }
  }
} satisfies Meta<typeof CharactersPreview>
export default meta
type Story = StoryObj<typeof meta>
export const CurrentCards: Story = {}
export const CurrentProfile: Story = { args: { detail: true } }
