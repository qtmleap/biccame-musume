// Webhook判定のプロンプトバージョンの表示名。
// IDはDBのキー（question_version）なので変えず、画面に出す名前だけをここで整える。
// 説明は各版の定義（generated/webhook-prompt-definitions.json）の差分に沿って、IDの末尾の名前を日本語にしたもの。

/** [保存されているID, 短い版番号, 説明]。新しい版を足したら、ここにも登録する（登録漏れはテストで落ちる）。 */
const PROMPT_VERSIONS: ReadonlyArray<readonly [string, number, string]> = [
  ['v2-webhook-v4', 4, '基本の質問'],
  ['v3-webhook-v5-associations', 5, '店舗・娘を個別に判定'],
  ['v3-webhook-v6-normalized-store-names', 6, '店舗名の正規化'],
  ['v4-webhook-v7-limited-sales-charge', 7, '限定販売・入金'],
  ['v4-webhook-v8-object-kind', 8, '対象物の種類'],
  ['v4-webhook-v9-topic-lifecycle', 9, '話題の経過'],
  ['v4-webhook-v10-operation-updates', 10, '運営情報の更新'],
  ['v5-webhook-v11-discovery-actions', 11, '発見と対応'],
  ['v5-webhook-v12-neutral-context', 12, '中立な文脈'],
  ['v5-webhook-v13-choice-associations', 13, '店舗・娘を選択式で判定'],
  ['v5-webhook-v14-concise-choices', 14, '選択肢の名前を簡潔に'],
  ['v5-webhook-v15-concise-author', 15, '投稿者の店舗名を簡潔に']
]

const PROMPT_VERSION_LABELS: ReadonlyMap<string, string> = new Map(
  PROMPT_VERSIONS.map(([id, number, description]) => [id, `v${number} ${description}`])
)

/**
 * プロンプトバージョンのIDを画面向けの表示名（例: `v13 店舗・娘を選択式で判定`）にする。
 * 登録されていないIDは作り替えず、そのまま返す。
 */
export const promptVersionLabel = (id: string): string => {
  const label = PROMPT_VERSION_LABELS.get(id)
  return label === undefined ? id : label
}
