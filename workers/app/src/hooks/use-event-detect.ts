import type { KeywordsRequestSchema, LabelRequest, PostQuery, PostView } from '@biccame/shared/event-detect/viewer'
import { type QueryClient, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { client } from '@/utils/client'

// イベント検出ビューワ（dev 専用）のデータ取得。ローカルの手元データを読むだけなので、
// 常に取り直し、永続キャッシュ（localStorage）には載せない。
const liveOptions = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: 'always',
  meta: { persist: false },
  networkMode: 'always'
} as const

const ROOT = ['admin', 'event-detect'] as const

const keys = {
  summary: [...ROOT, 'summary'],
  accounts: [...ROOT, 'accounts'],
  posts: [...ROOT, 'posts'],
  events: [...ROOT, 'events'],
  event: [...ROOT, 'event'],
  gaps: [...ROOT, 'gaps'],
  keywords: [...ROOT, 'keywords']
} as const

export type PostFilter = Partial<Omit<PostQuery, 'offset' | 'limit'>>

export const useEventDetectSummary = () =>
  useSuspenseQuery({ queryKey: keys.summary, queryFn: () => client.getEventDetectSummary(), ...liveOptions })

export const useEventDetectAccounts = () =>
  useSuspenseQuery({ queryKey: keys.accounts, queryFn: () => client.getEventDetectAccounts(), ...liveOptions })

export const useEventDetectPosts = (filter: PostFilter, offset: number, limit: number) =>
  useSuspenseQuery({
    queryKey: [...keys.posts, filter, offset, limit],
    queryFn: () => client.getEventDetectPosts({ queries: { ...filter, offset, limit } }),
    ...liveOptions
  })

export const useEventDetectEvents = () =>
  useSuspenseQuery({ queryKey: keys.events, queryFn: () => client.getEventDetectEvents(), ...liveOptions })

export const useEventDetectEvent = (id: string) =>
  useSuspenseQuery({
    queryKey: [...keys.event, id],
    queryFn: () => client.getEventDetectEvent({ params: { id } }),
    ...liveOptions
  })

export const useEventDetectGaps = () =>
  useSuspenseQuery({ queryKey: keys.gaps, queryFn: () => client.getEventDetectGaps(), ...liveOptions })

export const useEventDetectKeywords = () =>
  useSuspenseQuery({ queryKey: keys.keywords, queryFn: () => client.getEventDetectKeywords(), ...liveOptions })

type Label = PostView['label']

/** 画面に出ているすべての一覧で、該当の投稿のラベルだけを差し替える（一覧の並びと件数は動かさない） */
const patchLabel = (queryClient: QueryClient, id: string, label: Label) => {
  const patch = (post: PostView): PostView => {
    if (post.id !== id) return post
    const { label: _previous, ...rest } = post
    return label ? { ...rest, label } : rest
  }
  queryClient.setQueriesData<{ posts: PostView[] }>({ queryKey: keys.posts }, (data) =>
    data ? { ...data, posts: data.posts.map(patch) } : data
  )
  queryClient.setQueriesData<{ posts: PostView[] }>({ queryKey: keys.event }, (data) =>
    data ? { ...data, posts: data.posts.map(patch) } : data
  )
  queryClient.setQueriesData<{ gaps: { posts: PostView[] }[] }>({ queryKey: keys.gaps }, (data) =>
    data ? { gaps: data.gaps.map((gap) => ({ ...gap, posts: gap.posts.map(patch) })) } : data
  )
  queryClient.setQueriesData<{ droppedGold: PostView[] }>({ queryKey: keys.summary }, (data) =>
    data ? { ...data, droppedGold: data.droppedGold.map(patch) } : data
  )
}

/** 投稿に手動ラベルを付ける。label を省略すると外す */
export const useSetEventDetectLabel = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label?: LabelRequest }) =>
      label
        ? client.setEventDetectLabel(label, { params: { id } })
        : client.deleteEventDetectLabel(undefined, { params: { id } }),
    onSuccess: (result, { id }) => {
      patchLabel(queryClient, id, result.label ? result.label : undefined)
      // ファネルの手動ラベル件数は取り直す
      queryClient.invalidateQueries({ queryKey: keys.summary })
    }
  })
}

/** 無効にするキーワード・除外語を保存する。サーバー上の判定が変わるので、保存後は各画面が取り直す */
export const useSetEventDetectKeywords = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: z.infer<typeof KeywordsRequestSchema>) => client.setEventDetectKeywords(body),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.keywords, data)
    }
  })
}
