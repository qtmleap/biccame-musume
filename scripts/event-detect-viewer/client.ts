import type { z } from 'zod'
import {
  AccountsResponseSchema,
  EventDetailResponseSchema,
  EventsResponseSchema,
  GapsResponseSchema,
  KeywordsResponseSchema,
  type LabelRequest,
  LabelResponseSchema,
  type PostQuery,
  PostsResponseSchema,
  SummarySchema,
  VIEWER_BASE
} from '../lib/event-detect/schema'

// ローカルビューワの API クライアント。応答は共有スキーマで再検証する。

const request = async <T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> => {
  const response = await fetch(`${VIEWER_BASE}${path}`, init)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`)
  return parsed.data
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})

export type PostFilter = Partial<Omit<PostQuery, 'offset' | 'limit'>>

const toSearch = (filter: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(filter).flatMap(([key, value]) =>
      value === undefined || value === '' ? [] : [[key, String(value)]]
    )
  ).toString()

export const api = {
  summary: () => request(SummarySchema, '/api/summary'),
  accounts: () => request(AccountsResponseSchema, '/api/accounts'),
  posts: (filter: PostFilter, offset: number, limit: number) =>
    request(PostsResponseSchema, `/api/posts?${toSearch({ ...filter, offset, limit })}`),
  events: () => request(EventsResponseSchema, '/api/events'),
  event: (id: string) => request(EventDetailResponseSchema, `/api/events/${id}`),
  gaps: () => request(GapsResponseSchema, '/api/gaps'),
  keywords: () => request(KeywordsResponseSchema, '/api/keywords'),
  setDisabledKeywords: (disabled: string[]) =>
    request(KeywordsResponseSchema, '/api/keywords', json('POST', { disabled })),
  setLabel: (id: string, label: LabelRequest) => request(LabelResponseSchema, `/api/labels/${id}`, json('PUT', label)),
  deleteLabel: (id: string) => request(LabelResponseSchema, `/api/labels/${id}`, { method: 'DELETE' })
}
