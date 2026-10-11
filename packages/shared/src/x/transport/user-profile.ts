import { z } from 'zod'

// UserByScreenName GraphQL queryId. Like CREATE_TWEET, this rotates infrequently;
// re-extract from a live browser request when 404 / "operation not found" appears.
const USER_BY_SCREEN_NAME_QUERY_ID = 'IGgvgiOx4QZndDHuD3x9TQ'
export const USER_BY_SCREEN_NAME_PATH = `/i/api/graphql/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName`

/**
 * UserByScreenName GraphQL のレスポンスのうち、ヘルスチェック画面で使う
 * フィールドだけを抜き出した Zod スキーマ。X が新フィールドを生やしても
 * 壊れないよう、未使用のキーには触れない。
 */
export const UserByScreenNameResponseSchema = z.object({
  data: z.object({
    user: z.object({
      result: z.object({
        rest_id: z.string().nonempty(),
        core: z.object({
          name: z.string(),
          screen_name: z.string().nonempty(),
          created_at: z.string().nonempty()
        }),
        avatar: z.object({
          image_url: z.string()
        }),
        legacy: z.object({
          followers_count: z.number().int().nonnegative(),
          friends_count: z.number().int().nonnegative(),
          statuses_count: z.number().int().nonnegative(),
          favourites_count: z.number().int().nonnegative(),
          listed_count: z.number().int().nonnegative(),
          media_count: z.number().int().nonnegative(),
          description: z.string(),
          profile_banner_url: z.string().nonempty().optional()
        })
      })
    })
  })
})

export type TwitterAccountInfo = {
  restId: string
  screenName: string
  name: string
  followersCount: number
  friendsCount: number
  statusesCount: number
  favouritesCount: number
  listedCount: number
  mediaCount: number
  createdAt: string
  profileImageUrl: string
  profileBannerUrl: string | null
  description: string
}

/**
 * X のプロフィール画像 URL は末尾の `_normal.{ext}` で 48px に縮小されている。
 * 任意の解像度サフィックス (`_400x400`, `_bigger` 等) に置換すると高解像度版が返る。
 */
export const upgradeProfileImageResolution = (url: string): string => url.replace(/_normal(\.[^.]+)$/, '_400x400$1')

/** バナー画像はパスサフィックスでサイズ指定する。`/1500x500` で横 1500px。 */
export const upgradeBannerResolution = (url: string): string => `${url}/1500x500`
