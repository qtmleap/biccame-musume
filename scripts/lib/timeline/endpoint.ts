// vite.config.ts が読むスクリプト群（post-archive など）から参照される。
// client.ts は @biccame/shared（拡張子なし import）に依存し、Vite の設定ロード（素の Node ESM）で解決できないため、定数だけ分離している。
export const LIST_TIMELINE_ENDPOINT = '/i/api/graphql/1LE3u14FJjPZUHKFGzos2g/ListLatestTweetsTimeline'
