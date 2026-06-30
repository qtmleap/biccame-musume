import { makeApi, Zodios } from '@zodios/core'
import { activitiesEndpoints } from './activities'
import { adminEndpoints } from './admin'
import { authEndpoints } from './auth'
import { badgesEndpoints } from './badges'
import { charactersEndpoints } from './characters'
import { commentsEndpoints } from './comments'
import { eventGroupsEndpoints } from './event-groups'
import { eventsEndpoints } from './events'
import { favoritesEndpoints } from './favorites'
import { searchEndpoints } from './search'
import { statsEndpoints } from './stats'
import { usersEndpoints } from './users'
import { versionEndpoints } from './version'
import { votesEndpoints } from './votes'

export { VersionResponseSchema } from './version'

/**
 * Zodios API 定義。 ドメイン別にエンドポイント配列を分割管理し、 ここで合成する。
 * 新しいドメインを追加する際は src/utils/client/<domain>.ts を作って配列を export し、
 * 下の spread に追加すること。
 */
const api = makeApi([
  ...versionEndpoints,
  ...charactersEndpoints,
  ...votesEndpoints,
  ...eventsEndpoints,
  ...eventGroupsEndpoints,
  ...searchEndpoints,
  ...statsEndpoints,
  ...authEndpoints,
  ...usersEndpoints,
  ...activitiesEndpoints,
  ...favoritesEndpoints,
  ...badgesEndpoints,
  ...commentsEndpoints,
  ...adminEndpoints
])

/**
 * Zodios クライアント
 */
export const client = new Zodios('/', api)
