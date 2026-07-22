import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

/**
 * DB / 外部 API から取得した JSON 文字列を Zod スキーマで検証しながら parse する。
 * `JSON.parse(...) as T` によるランタイム未検証のキャストを避けるための共通ヘルパー。
 */
export const parseJsonWithSchema = <T>(raw: string, schema: z.ZodType<T>): T => {
  const parsed = schema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    throw new HTTPException(500, { message: 'malformed stored JSON' })
  }
  return parsed.data
}
