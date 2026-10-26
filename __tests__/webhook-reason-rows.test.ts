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

  test('判定理由の行は、二段組の他の行（最終更新まで）の後ろに、両列にまたがって出る', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held', reasons: ['store_unconfirmed'] })
    expect(markup.indexOf('判定理由')).toBeGreaterThan(markup.indexOf('最終更新'))
    expect(markup).toMatch(/<div class="[^"]*md:col-span-2[^"]*"><dt[^>]*>判定理由<\/dt>/)
  })

  test('未知の理由コードは判定理由の側に残り、補足は出ない', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'held', reasons: ['future_reason', 'title_fallback'] })
    const judgment = rowOf(markup, '判定理由')
    expect(judgment).toBeDefined()
    if (judgment === undefined) return
    expect(itemsOf(judgment)).toEqual(['future_reason'])
    expect(markup).not.toContain('タイトルは定型')
  })

  describe('自動登録できなかったことを示す総括のコード（auto_registration_not_allowed）', () => {
    const generic = 'auto_registration_not_allowed'

    test('具体的な理由が併記されるときは、具体的な理由だけを出し、生のコードは画面に出さない', async () => {
      const reasons = [generic, 'distribution_item_count_mismatch']
      const markup = await renderDetail({ ...baseJob, status: 'held', reasons })
      const judgment = rowOf(markup, '判定理由')
      expect(judgment).toBeDefined()
      if (judgment === undefined) return
      expect(itemsOf(judgment)).toEqual(['配布物の種類数と抽出結果が一致しない'])
      expect(judgment).not.toContain(generic)
      expect(markup).not.toContain(generic)
      expect(reasons).toEqual([generic, 'distribution_item_count_mismatch'])
    })

    test('唯一の理由なら、日本語のラベルで出す（生のコードでも「理由の記録なし」でもない）', async () => {
      const markup = await renderDetail({ ...baseJob, status: 'held', reasons: [generic] })
      const judgment = rowOf(markup, '判定理由')
      expect(judgment).toBeDefined()
      if (judgment === undefined) return
      expect(itemsOf(judgment)).toEqual(['自動登録の条件を満たさない'])
      expect(judgment).not.toContain('理由の記録なし')
      expect(judgment).toContain(`title="${generic}"`)
    })

    test('title_generated などの情報用のコードと併せても同じ', async () => {
      const only = await renderDetail({ ...baseJob, status: 'held', reasons: [generic, 'title_generated'] })
      const onlyRow = rowOf(only, '判定理由')
      expect(onlyRow).toBeDefined()
      if (onlyRow === undefined) return
      expect(itemsOf(onlyRow)).toEqual(['自動登録の条件を満たさない'])
      const withSpecific = await renderDetail({
        ...baseJob,
        status: 'held',
        reasons: ['title_fallback', generic, 'store_unconfirmed']
      })
      const specificRow = rowOf(withSpecific, '判定理由')
      expect(specificRow).toBeDefined()
      if (specificRow === undefined) return
      expect(itemsOf(specificRow)).toEqual(['開催店舗を確定できない'])
      expect(withSpecific).not.toContain('タイトルは定型')
    })
  })
})
