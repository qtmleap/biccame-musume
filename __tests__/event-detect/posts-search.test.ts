import { describe, expect, test } from 'bun:test'
import { EventDetectPostsSearchSchema } from '@/schemas/event-detect-search'

/** 不正な値は項目ごとに既定へ戻るので、どんな入力でも成功する */
const parse = (input: unknown) => {
  const result = EventDetectPostsSearchSchema.safeParse(input)
  expect(result.success).toBe(true)
  return result.data
}

describe('EventDetectPostsSearchSchema の judge と bin', () => {
  test('judge と bin がそろっていれば通す', () => {
    expect(parse({ judge: 'llm', bin: 9 })).toMatchObject({ judge: 'llm', bin: 9 })
    expect(parse({ judge: 'clef', bin: 0 })).toMatchObject({ judge: 'clef', bin: 0 })
  })

  test('どちらも省略できて、省略時は両方とも持たない', () => {
    const search = parse({})
    expect(search).not.toHaveProperty('judge')
    expect(search).not.toHaveProperty('bin')
    expect(search).toMatchObject({ scope: 'unlabeled', dedup: true, page: 1 })
  })

  test('範囲外・小数・文字列の bin は省略へ戻り、judge も一緒に外れる', () => {
    for (const bin of [10, -1, 1.5, '3', null]) {
      const search = parse({ judge: 'llm', bin })
      expect(search).not.toHaveProperty('judge')
      expect(search).not.toHaveProperty('bin')
    }
  })

  test('不正な judge は省略へ戻り、bin も一緒に外れる', () => {
    for (const judge of ['foo', 1, null]) {
      const search = parse({ judge, bin: 3 })
      expect(search).not.toHaveProperty('judge')
      expect(search).not.toHaveProperty('bin')
    }
  })

  test('片方だけなら両方とも外す', () => {
    expect(parse({ judge: 'llm' })).not.toHaveProperty('judge')
    expect(parse({ bin: 4 })).not.toHaveProperty('bin')
  })

  test('judge と bin が不正でも、他の項目は影響を受けない', () => {
    expect(parse({ scope: 'gold', account: 'bic_example', judge: 'foo', bin: 99, page: 3 })).toMatchObject({
      scope: 'gold',
      account: 'bic_example',
      page: 3
    })
  })
})
