import { WebhookJobQuerySchema } from '@biccame/shared/schemas/webhook.dto'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { z } from 'zod'

const KEY = 'biccame-admin-webhook-pagination'

// カーソルは API の cursor クエリと同じ形式（投稿IDの数字列）。形が違う保存値は取得時に 400 になるので、ここで弾く。
const CursorSchema = WebhookJobQuerySchema.shape.cursor.unwrap()

/**
 * 保存する値の整合条件。
 * 1ページ目は cursor が null で previousCursors が空。2ページ目以降は cursor が非 null で、
 * previousCursors の先頭だけが null（1ページ目）、残りは非 null。
 * 外れた値だと「前へ」で1ページ目に戻れなくなるので、保存値として受け付けない。
 */
const isConsistent = ({ cursor, previousCursors }: { cursor: string | null; previousCursors: (string | null)[] }) =>
  (cursor === null) === (previousCursors.length === 0) &&
  previousCursors.every((previous, index) => (previous === null) === (index === 0))

export const WebhookPaginationSchema = z
  .object({
    cursor: CursorSchema.nullable(),
    previousCursors: z.array(CursorSchema.nullable())
  })
  .refine(isConsistent)
export type WebhookPagination = z.infer<typeof WebhookPaginationSchema>

/** 1ページ目。保存が無い・壊れているときの値。 */
export const INITIAL_WEBHOOK_PAGINATION: WebhookPagination = { cursor: null, previousCursors: [] }

/** 保存値を検証する。形が違う値は1ページ目に倒す。 */
export const parseWebhookPagination = (value: unknown): WebhookPagination => {
  const result = WebhookPaginationSchema.safeParse(value)
  return result.success ? result.data : INITIAL_WEBHOOK_PAGINATION
}

/** 次ページへ進める。現在の cursor を戻り先に積む。 */
export const nextWebhookPagination = (previous: WebhookPagination, nextCursor: string): WebhookPagination => ({
  cursor: nextCursor,
  previousCursors: [...previous.previousCursors, previous.cursor]
})

/** 1つ前のページへ戻る。1ページ目では何もしない。 */
export const previousWebhookPagination = (previous: WebhookPagination): WebhookPagination => {
  const previousCursor = previous.previousCursors.at(-1)
  if (previousCursor === undefined) return previous
  return { cursor: previousCursor, previousCursors: previous.previousCursors.slice(0, -1) }
}

// sessionStorage に触れない環境（プライベートモード・容量超過・SSR やテスト）でも、一覧の操作を止めない。
const sessionStringStorage = {
  getItem: (key: string) => {
    try {
      return window.sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.sessionStorage.setItem(key, value)
    } catch {
      // 保存できなくても、メモリ上の状態でそのタブの操作は続けられる。
    }
  },
  removeItem: (key: string) => {
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // 保存できなくても、メモリ上の状態でそのタブの操作は続けられる。
    }
  }
}

const raw = createJSONStorage<unknown>(() => sessionStringStorage)

// jotai は SyncStorage 型を公開していないので、createJSONStorage の戻り値から導く。
type PaginationStorage = ReturnType<typeof createJSONStorage<WebhookPagination>>
// 読み出しのたびに形を検証する。sessionStorage はタブ単位なので、他タブの書き込みを購読する subscribe は持たない。
const storage: PaginationStorage = {
  getItem: (key) => parseWebhookPagination(raw.getItem(key, null)),
  setItem: (key, value) => raw.setItem(key, value),
  removeItem: (key) => raw.removeItem(key)
}

/**
 * Webhook 受信履歴のページ位置（現在の cursor と、戻り先の cursor の履歴）
 * 詳細から戻る・ブラウザの戻る・再読み込みで1ページ目に戻らないよう、タブ単位の sessionStorage に保存する。
 * 初回の描画から保存値を使う（getOnInit）。使わないと1ページ目を一度取りに行ってしまう。
 */
export const webhookPaginationAtom = atomWithStorage<WebhookPagination>(KEY, INITIAL_WEBHOOK_PAGINATION, storage, {
  getOnInit: true
})
