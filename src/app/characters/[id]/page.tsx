import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { charactersQueryKey } from '@/hooks/useCharacters'
import { getCharacters } from '@/lib/characters'
import { getCharacterImageUrl } from '@/lib/utils'
import { CharacterDetailClient } from './character-detail-client'

type PageProps = {
  params: Promise<{ id: string }>
}

/**
 * 動的メタデータ生成
 */
export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { id } = await params
  const characters = await getCharacters()
  const character = characters.find((c) => c.key === id)

  if (!character) {
    return {
      title: 'キャラクターが見つかりません'
    }
  }

  const title = `${character.character_name} (${character.store_name})`
  const description = character.description || `${character.character_name}のプロフィール情報`
  const imageUrl = getCharacterImageUrl(character)

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ビッカメ娘 -ビックカメラ店舗擬人化プロジェクト-`,
      description,
      images: imageUrl ? [{ url: imageUrl, alt: character.character_name }] : undefined
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ビッカメ娘`,
      description,
      images: imageUrl ? [imageUrl] : undefined
    }
  }
}

/**
 * ビルド時に全キャラクターのIDを生成（SSG）
 */
export const generateStaticParams = async () => {
  const characters = await getCharacters()
  return characters.map((character) => ({
    id: character.key
  }))
}

/**
 * キャラクター詳細ページ（Server Component）
 */
const CharacterDetailPage = async ({ params }: PageProps) => {
  const { id } = await params
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: charactersQueryKey,
    queryFn: getCharacters
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CharacterDetailClient id={id} />
    </HydrationBoundary>
  )
}

export default CharacterDetailPage
