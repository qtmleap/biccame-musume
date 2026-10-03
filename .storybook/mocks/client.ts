import { badges, characters, comments, eventDetail, events, group, now } from '../../src/stories/catalogue-fixtures'
import { client as transport } from '../../src/utils/client/index'
import { runtime } from '../catalogue/runtime'

export { VersionResponseSchema } from '../../src/utils/client/version'

const initialActivities = () => ({
  stores: ['abeno'],
  events: { interested: [events[0].uuid], completed: [events[2].uuid] }
})
let favorites = ['abeno']
let activities = initialActivities()
export const resetClientFixture = () => {
  favorites = ['abeno']
  activities = initialActivities()
}
const list = <T>(data: T[]) => (runtime.state === 'empty' ? [] : data)
type APIResponseFixtures = {
  [Key in keyof typeof transport]?: (typeof transport)[Key] extends (...args: never[]) => infer Result
    ? () => Awaited<Result>
    : never
}
const responses = {
  getCharacters: () => characters,
  getEvents: () => list(events),
  getEvent: () => eventDetail,
  getEventGroups: () => list([group]),
  getEventGroup: () => group,
  getAdminEventGroup: () => group,
  getVotes: () => characters.map((c, i) => ({ key: c.id, count: [120, 80, 25][i] })),
  getPageViews: () => ({ today: 12, total: 345 }),
  getFavoriteCharacters: () => ({ favorites: list(favorites) }),
  getUserActivities: () =>
    runtime.state === 'empty' ? { stores: [], events: { interested: [], completed: [] } } : activities,
  getUserStores: () => ({ stores: activities.stores }),
  getUserEvents: () => ({ events: activities.events.interested }),
  getBadges: () => ({ badges: list(badges) }),
  getAllBadgesAdmin: () => ({ badges: list(badges) }),
  getMyBadges: () => ({ earned: list([{ code: badges[0].code, earnedAt: now }]) }),
  getBadgeHoldersCount: () => ({ total: 2 }),
  getAdminBadgeHolders: () => ({
    total: 1,
    holders: [{ uid: 'storybook-user', displayName: '合成ユーザー', thumbnailURL: null, earnedAt: now }]
  }),
  getAdminBadgeRanking: () => ({
    total: 1,
    entries: list([
      {
        rank: 1,
        uid: 'storybook-user',
        displayName: '合成ユーザー',
        thumbnailURL: null,
        createdAt: now,
        earnedCount: 1,
        lastEarnedAt: now,
        rarityBreakdown: { common: 1, rare: 0, epic: 0, legendary: 0, mythic: 0 }
      }
    ])
  }),
  getAdminUserBadges: () => ({
    user: { uid: 'storybook-user', displayName: '合成ユーザー', thumbnailURL: null },
    badges: [
      {
        code: badges[0].code,
        name: 'あべの店訪問',
        category: 'store',
        subCategory: 'visit',
        rarity: 'common',
        iconName: 'MapPin',
        earnedAt: now
      }
    ]
  }),
  getAdminComments: () => ({
    comments: list(
      comments.map((c) => ({
        ...c,
        eventId: events[0].uuid,
        eventTitle: events[0].title,
        userId: 'storybook-user',
        ipAddress: '127.0.0.1',
        deletedAt: null
      }))
    )
  }),
  getAdminUsers: () => ({
    users: list([
      {
        id: 'storybook-user',
        displayName: '合成ユーザー',
        email: 'storybook@example.invalid',
        thumbnailURL: null,
        createdAt: now
      }
    ])
  }),
  getAdminTwitterStatus: () => ({
    ok: true,
    error: null,
    fetchedAt: now,
    account: {
      restId: '00000',
      screenName: 'storybook_fixture',
      name: 'Storybook合成アカウント',
      followersCount: 12,
      friendsCount: 5,
      statusesCount: 50,
      favouritesCount: 2,
      listedCount: 1,
      mediaCount: 8,
      createdAt: now,
      profileImageUrl: characters[0].character.image_url,
      profileBannerUrl: null,
      description: 'ネットワークを使用しない表示用データ'
    }
  }),
  getCurrentUser: () => ({
    id: 'storybook-user',
    displayName: '合成ユーザー',
    email: 'storybook@example.invalid',
    thumbnailURL: null,
    screenName: null
  }),
  authenticate: () => ({ success: true }),
  logout: () => ({ success: true }),
  trackPageView: () => ({ success: true }),
  createVote: () => ({
    success: true,
    message: 'Storybook内で応援を記録しました',
    nextVoteDate: '2026-10-03',
    newBadges: []
  }),
  createBulkVote: () => ({
    success: true,
    nextVoteDate: '2026-10-03',
    results: characters.map((c) => ({ characterId: c.id, status: 'voted' })),
    votedCount: 3,
    skippedCount: 0,
    newBadges: []
  }),
  createEvent: () => eventDetail,
  updateEvent: () => eventDetail,
  deleteEvent: () => ({ success: true }),
  createEventGroup: () => group,
  updateEventGroup: () => group,
  deleteEventGroup: () => ({ success: true }),
  linkEventsToGroup: () => ({ updated: 2 }),
  unlinkEventsFromGroup: () => ({ updated: 2 }),
  createEventComment: () => comments[0],
  deleteEventComment: () => ({ message: 'Storybook内でコメント削除を記録しました' }),
  checkDuplicateUrl: () => ({ exists: false, events: [] }),
  createSpecialBadge: () => ({ badge: badges[1] }),
  updateBadge: () => ({ badge: badges[1] }),
  deleteBadge: () => undefined,
  recalculateBadges: () => ({ processedUsers: 1, scheduled: true })
} satisfies APIResponseFixtures
export const client = new Proxy(transport, {
  get(target, key, receiver) {
    if (typeof key !== 'string' || typeof Reflect.get(target, key, receiver) !== 'function')
      return Reflect.get(target, key, receiver)
    return async (...args: unknown[]) => {
      runtime.calls.push(key)
      if (key === 'addFavoriteCharacter') {
        const config = args[1] as { params: { characterId: string } }
        favorites = [...favorites, config.params.characterId]
        return { success: true }
      }
      if (key === 'removeFavoriteCharacter') {
        const config = args[1] as { params: { characterId: string } }
        favorites = favorites.filter((id) => id !== config.params.characterId)
        return { success: true }
      }
      if (key === 'updateUserStore' || key === 'deleteUserStore') {
        const config = args[1] as { params: { storeKey: string } }
        activities.stores =
          key === 'updateUserStore'
            ? [...activities.stores, config.params.storeKey]
            : activities.stores.filter((id) => id !== config.params.storeKey)
        return { success: true, newBadges: [] }
      }
      if (key === 'updateUserEvent' || key === 'deleteUserEvent') {
        const body = args[0] as { status: 'interested' | 'completed' } | undefined
        const config = args[1] as { params: { eventId: string }; queries?: { status: 'interested' | 'completed' } }
        const status = body?.status ?? config.queries?.status ?? 'interested'
        activities.events[status] =
          key === 'updateUserEvent'
            ? [...activities.events[status], config.params.eventId]
            : activities.events[status].filter((id) => id !== config.params.eventId)
        return { success: true, newBadges: [] }
      }
      const response = Reflect.get(responses, key)
      if (typeof response !== 'function') {
        runtime.unexpected.push(key)
        throw new Error(`Unhandled Storybook API boundary: ${key}`)
      }
      if (runtime.state === 'loading' && key.startsWith('get')) return new Promise(() => {})
      if (runtime.state === 'error' && key.startsWith('get')) throw new Error('Storybookで指定した読み込みエラー')
      return response()
    }
  }
})
