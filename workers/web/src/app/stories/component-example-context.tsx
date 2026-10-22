import { CharacterFavoriteButton } from '@/components/characters/character-favorite-button'
import { CharacterFollowButton } from '@/components/characters/character-follow-button'

export const SyntheticFailure = (): never => {
  throw new Error('Storybookで指定した子コンポーネントのエラー')
}
export const providerChild = (
  <section className='rounded-xl bg-card p-4 border border-card-border'>
    <h2 className='font-bold mb-3'>認証コンテキスト内の実コンポーネント</h2>
    <CharacterFavoriteButton characterId='abeno' characterName='あべのたん' />
    <CharacterFollowButton twitterId='storybook_fixture' />
  </section>
)
