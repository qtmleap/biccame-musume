import type { Meta, StoryObj } from '@storybook/react-vite'
import { CharacterListCard } from '@/components/character-list-card'
import { CharacterProfileSection } from '@/components/characters/detail/character-profile-section'
import { character, longNameCharacter } from './fixtures'

function CharactersPreview({ detail = false, proposal = false }: { detail?: boolean; proposal?: boolean }) {
  if (detail)
    return (
      <div className='mx-auto max-w-3xl'>
        <CharacterProfileSection character={character} />
      </div>
    )
  return (
    <div className='mx-auto grid max-w-5xl gap-5 md:grid-cols-2'>
      {[character, longNameCharacter].map((c, index) => (
        <div key={c.id} className='space-y-2'>
          <CharacterListCard character={c} index={index} rotation={proposal ? 0 : undefined} />
          {proposal && (
            <p className='px-3 text-sm text-muted-foreground'>
              {c.store?.name} · {c.prefecture}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
const meta = {
  title: 'Review/Characters',
  component: CharactersPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '#62/#63/#65。実カード・プロフィールを使用。店舗表示と回転0度は改善案。未ログイン状態で、応援はローカルモックのみです。'
      }
    }
  }
} satisfies Meta<typeof CharactersPreview>
export default meta
type Story = StoryObj<typeof meta>
export const CurrentCards: Story = {}
export const ProposedStoreLabels: Story = { args: { proposal: true } }
export const CurrentProfile: Story = { args: { detail: true } }
