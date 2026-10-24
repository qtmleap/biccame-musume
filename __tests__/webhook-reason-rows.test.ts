import { describe, expect, test } from 'bun:test'
import { baseJob, renderDetail } from './fixtures/webhook-rejudge'

/** 行のラベルに対応する <dd> の中身。行が無ければ undefined。 */
const rowOf = (markup: string, label: string): string | undefined => {
  const match = new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>(.*?)</dd>`).exec(markup)
  return match === null ? undefined : match[1]
}

/** <li> の表示文言だけを並び順のまま取り出す（title 属性の理由コードは含めない）。 */
const itemsOf = (row: string): string[] => [...row.matchAll(/<li\b[^>]*>(.*?)<\/li>/g)].map((match) => match[1])

const NOTE_LABELS = ['店舗は投稿アカウントから補完', 'タイトルは AI が作成', 'タイトルは定型']

describe('受信詳細の判定理由', () => {
  test('登録時の補足の行は出さない。補足のラベルも判定理由の行や画面のどこにも出ない', async () => {
    const markup = await renderDetail({
      ...baseJob,
      status: 'registered',
      reasons: [
        'title_generated',
        'manually_linked',
        'store_inferred_from_account',
        'store_unconfirmed',
        'title_fallback'
      ]
    })
    expect(markup).not.toContain('登録時の補足')
    const judgment = rowOf(markup, '判定理由')
    expect(judgment).toBeDefined()
    if (judgment === undefined) return
    for (const label of NOTE_LABELS) {
      expect(judgment).not.toContain(label)
      expect(markup).not.toContain(label)
    }
  })

  test('判定の理由は保存された並びのまま判定理由の行に出る', async () => {
    const markup = await renderDetail({
      ...baseJob,
      status: 'registered',
      reasons: ['title_generated', 'manually_linked', 'store_inferred_from_account', 'store_unconfirmed']
    })
    const judgment = rowOf(markup, '判定理由')
    expect(judgment).toBeDefined()
    if (judgment === undefined) return
    expect(itemsOf(judgment)).toEqual(['手動で紐付け', '開催店舗を確定できない'])
  })

  test('補足だけのときは、判定理由は理由の記録なしになる', async () => {
    const markup = await renderDetail({
      ...baseJob,
      status: 'registered',
      reasons: ['title_generated', 'store_inferred_from_account', 'title_fallback']
    })
    expect(rowOf(markup, '判定理由')).toBe('理由の記録なし')
    expect(markup).not.toContain('登録時の補足')
  })

  test('理由が空のときは、判定理由は理由の記録なしになる', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held', reasons: [] })
    expect(rowOf(markup, '判定理由')).toBe('理由の記録なし')
    expect(markup).not.toContain('登録時の補足')
  })

  test('判定理由の行は処理回数の行より前にある', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held', reasons: ['store_unconfirmed'] })
    expect(markup.indexOf('判定理由')).toBeGreaterThan(-1)
    expect(markup.indexOf('判定理由')).toBeLessThan(markup.indexOf('処理回数'))
  })

  test('未知の理由コードは判定理由の側に残り、補足は出ない', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held', reasons: ['future_reason', 'title_fallback'] })
    const judgment = rowOf(markup, '判定理由')
    expect(judgment).toBeDefined()
    if (judgment === undefined) return
    expect(itemsOf(judgment)).toEqual(['future_reason'])
    expect(markup).not.toContain('タイトルは定型')
  })
})
