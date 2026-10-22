import { DetectPostSchema } from '@biccame/shared/event-detect/post'
import { z } from 'zod'

const rawInput = z.object({ post: DetectPostSchema.omit({ extractionContext: true }) })

// 正解・D1診断・過去予測・物品注釈をAI入力へ混ぜず、原投稿の公開fieldだけを取り出す。
export const goalModelPost = (sample: unknown) => {
  const parsed = rawInput.safeParse(sample)
  if (!parsed.success) throw new Error('Invalid raw evaluation post')
  return parsed.data.post
}
