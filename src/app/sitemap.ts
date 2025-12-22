import dayjs from 'dayjs'
import type { MetadataRoute } from 'next'
import { getCharacters } from '@/lib/characters'

const siteUrl = 'https://bicqlo.vercel.app'

/**
 * 動的サイトマップ生成
 */
const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const characters = await getCharacters()
  const now = dayjs().toDate()

  // 静的ページ
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: `${siteUrl}/characters`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9
    },
    {
      url: `${siteUrl}/calendar`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8
    },
    {
      url: `${siteUrl}/location`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7
    },
    {
      url: `${siteUrl}/ranking`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8
    },
    {
      url: `${siteUrl}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    }
  ]

  // キャラクター詳細ページ
  const characterPages: MetadataRoute.Sitemap = characters.map((character) => ({
    url: `${siteUrl}/characters/${character.key}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6
  }))

  return [...staticPages, ...characterPages]
}

export default sitemap
