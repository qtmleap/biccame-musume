// Webhook判定のプロンプトバージョンの表示名。
// IDはDBのキー（question_version）なので変えず、画面に出す名前（版番号だけ）をここで整える。

/** [保存されているID, 短い版番号]。新しい版を足したら、ここにも登録する（登録漏れはテストで落ちる）。 */
const PROMPT_VERSIONS: ReadonlyArray<readonly [string, number]> = [
  ['v2-webhook-v4', 4],
  ['v3-webhook-v5-associations', 5],
  ['v3-webhook-v6-normalized-store-names', 6],
  ['v4-webhook-v7-limited-sales-charge', 7],
  ['v4-webhook-v8-object-kind', 8],
  ['v4-webhook-v9-topic-lifecycle', 9],
  ['v4-webhook-v10-operation-updates', 10],
  ['v5-webhook-v11-discovery-actions', 11],
  ['v5-webhook-v12-neutral-context', 12],
  ['v5-webhook-v13-choice-associations', 13],
  ['v5-webhook-v14-concise-choices', 14],
  ['v5-webhook-v15-concise-author', 15],
  ['v5-webhook-v16-confirm-selection', 16],
  ['v5-webhook-v17-store-character', 17]
]

const PROMPT_VERSION_LABELS: ReadonlyMap<string, string> = new Map(
  PROMPT_VERSIONS.map(([id, number]) => [id, `v${number}`])
)

/**
 * プロンプトバージョンのIDを画面向けの表示名（版番号だけ。例: `v13`）にする。
 * 登録されていないIDは作り替えず、そのまま返す。
 */
export const promptVersionLabel = (id: string): string => {
  const label = PROMPT_VERSION_LABELS.get(id)
  return label === undefined ? id : label
}
