/** イベントを消すとき、seed が作った子テーブルだけを一緒に消す。対象キャラが明示されたイベントも保護するため event_characters は含めない。 */
export const OWNED_TABLES: readonly string[] = ['event_stores', 'event_reference_urls', 'event_conditions']

/** 比較の差を順に見て、最初に 0 でないものを返す */
export const chain = (...diffs: number[]) => diffs.reduce((first, diff) => (first !== 0 ? first : diff), 0)

/** Map のキーに行を足す（無ければ新しい配列を作る） */
export const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const group = map.get(key)
  if (group) group.push(value)
  else map.set(key, [value])
}
