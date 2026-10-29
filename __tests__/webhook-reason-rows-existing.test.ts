import { describe, expect, test } from 'bun:test'
import { baseJob, renderDetail } from './fixtures/webhook-rejudge'

// 継続・終了と判定された旧ジョブは、保存済みの理由に新規登録向けの理由（初回開始日が未記載など）がすでに入っている。
// 詳細画面を実際に描画して、判定理由の行の文言から除かれていること（と、告知の保留では従来どおり出ること）を確かめる。

/** 行のラベルに対応する <dd> の中身。行が無ければ undefined。 */
const rowOf = (markup: string, label: string): string | undefined => {
  const match = new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>([\\s\\S]*?)</dd>`).exec(markup)
  return match === null ? undefined : match[1]
}

/** <li> の表示文言だけを並び順のまま取り出す（title 属性の理由コードは含めない）。 */
const itemsOf = (row: string): string[] => [...row.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1])

const judgmentItems = async (reasons: string[]) => {
  const markup = await renderDetail({ ...baseJob, status: 'held', reasons })
  const row = rowOf(markup, '判定理由')
  expect(row).toBeDefined()
  return { markup, items: row === undefined ? [] : itemsOf(row), row }
}

describe('受信詳細の判定理由: 継続・終了の旧ジョブ', () => {
  test('終了の旧ジョブに「初回開始日が未記載」は出ず、終了の理由だけが出る', async () => {
    const { markup, items } = await judgmentItems(['event_ended', 'start_date_unspecified'])
    expect(items).toEqual(['既存企画の終了情報'])
    expect(markup).not.toContain('初回開始日が未記載')
    expect(markup).not.toContain('start_date_unspecified')
  })

  test('継続の旧ジョブも、日付・配布条件・購入額・未対応の条件の理由が画面に出ない', async () => {
    const { markup, items } = await judgmentItems([
      'existing_event_update',
      'start_date_unconfirmed',
      'end_date_unconfirmed',
      'invalid_date_range',
      'distribution_condition_unspecified',
      'purchase_amount_unconfirmed',
      'charge_amount_unconfirmed',
      'unmodeled_distribution_condition'
    ])
    expect(items).toEqual(['既存企画の継続・更新情報'])
    for (const label of [
      '開始日を確定できない',
      '終了日を確定できない',
      '期間が不正',
      '入手条件が未記載・未発表',
      '購入額を確定できない',
      '入金・チャージ額を確定できない',
      '未対応の配布条件'
    ])
      expect(markup).not.toContain(label)
  })

  test('終了の旧ジョブでも、店舗・娘・配布物の理由は保存された並びのまま残る', async () => {
    const { items } = await judgmentItems([
      'event_ended',
      'distribution_item_unspecified',
      'store_unconfirmed',
      'start_date_unspecified',
      'character_unconfirmed'
    ])
    expect(items).toEqual([
      '既存企画の終了情報',
      '対象物が未記載・未発表',
      '開催店舗を確定できない',
      '対象ビッカメ娘を確定できない'
    ])
  })

  test('新規登録向けの理由を除いても、既存の除外（補足・総括）と併用でき、理由の記録なしにはならない', async () => {
    const { row, items } = await judgmentItems([
      'title_generated',
      'event_ended',
      'start_date_unspecified',
      'auto_registration_not_allowed'
    ])
    expect(items).toEqual(['既存企画の終了情報'])
    expect(row).not.toContain('理由の記録なし')
  })
})

describe('受信詳細の判定理由: 告知・状態が確定しない旧ジョブ', () => {
  test('告知の保留では、初回開始日が未記載を従来どおり出す', async () => {
    const { items } = await judgmentItems(['start_date_unspecified', 'distribution_condition_unspecified'])
    expect(items).toEqual(['初回開始日が未記載', '入手条件が未記載・未発表'])
  })

  test('状態を確定できない保留でも、日付の理由を除かない', async () => {
    const { items } = await judgmentItems(['status_unconfirmed', 'start_date_unspecified'])
    expect(items).toEqual(['告知・継続・終了の状態を確定できない', '初回開始日が未記載'])
  })
})
