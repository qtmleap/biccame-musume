# Work Plan: キャラクター情報の一括生成パイプライン整備

Date: 2026-05-01

## Goal

- Fetch HTML Cache でスキップされている実在店舗 (machida / kyoto / funato / seiseki / tamapla) を取得できるようにする
- biccame.jp のカレンダーから 擬人化N周年 / 店舗誕生N周年 を自動抽出し、`character.birthday` を手書き `birthday.json` から脱却させる
- `bun .vscode/scripts/fetch_html.ts && bun .vscode/scripts/parse_store_info.ts` で `public/characters.json` まで一気通貫で生成できる状態にする

## Tasks

### `.vscode/scripts/fetch_html.ts`

- [ ] `SHOP_ID_OVERRIDES: Record<string, number>` を追加 (profile に `shoplist` リンクがないキー用の手動マップ)
  - 暫定で空オブジェクト。user が後で埋める想定。埋めると `store_${key}.html` が取得される
- [ ] profile 解析で shoplist リンクが見つからなかった場合に `SHOP_ID_OVERRIDES[key]` を参照するフォールバックを追加
- [ ] スキップ時のログを「該当 ID を override に追加してね」と分かる文言に変更
- [ ] カレンダー HTML 取得処理を追加
  - URL: `https://biccame.jp/calendar/${YEAR}/${String(M).padStart(2,'0')}/`
  - YEAR = `new Date().getFullYear()`、M = 1..12
  - キャッシュ名: `calendar_${YEAR}_${MM}.html`
  - 既存キャッシュがあればスキップ (forceRefresh 対応)

### `.vscode/scripts/parse_store_info.ts`

- [ ] カレンダー HTML パーサ `parseCalendar(html, year, month)` を追加
  - `<td>` のうち `color:#CCCCCC` を含むセル (隣月) は除外
  - 各 `<a href="https://biccame.jp/profile/{key}.html">` から key を抽出
  - innerText から `(.+)(擬人化|店舗誕生)(\d+)周年` を抽出して type と N を判定
  - day は `<div>` 内の数字 (`<div class='today'>` も対応)
  - 戻り値: `Array<{ key, type: 'character'|'store', date: 'YYYY-MM-DD' }>` (date = 当年MMDD で OK、年は当年で揃える)
- [ ] 全 `calendar_*.html` を読み、key ごとに `{ character_birthday, store_birthday }` マップを構築
  - 注: 擬人化N周年の N から「初年」を逆算するなら `year - N` 月日固定。`character.birthday` には初年を入れる方針で揃える (= 既存 `birthday.json` の形式と一致)
- [ ] 既存の `birthday.json` マージ処理を、カレンダー由来マップ → `birthday.json` (overrides) の順に統合する形へ変更
  - `birthday.json` は overrides として残す (null で意図的に空にする概念キャラ用)
- [ ] `store.birthday` も profile HTML から取れない場合はカレンダー由来 store_birthday を使うフォールバックを入れる

### `.vscode/tasks.json`

- [ ] 既存「Fetch HTML Cache」が profile + store + calendar を全部取るので変更不要 (fetch_html.ts に内包)
- [ ] 必要なら「Build Characters」(fetch + parse をまとめて実行) を追加するか確認 → ユーザー判断

## Execution Order

1. fetch_html.ts: SHOP_ID_OVERRIDES + カレンダー取得 を追加
2. parse_store_info.ts: カレンダーパーサ + 統合
3. 動作確認 (実カレンダー取得 → JSON 生成 → 旧 birthday.json と差分照合)
4. qa: tsc / biome / commit

## Deliverables

- `.vscode/scripts/fetch_html.ts` (更新)
- `.vscode/scripts/parse_store_info.ts` (更新)
- `.vscode/archive/html_cache/calendar_YYYY_MM.html` × 12 (生成物、git に入れるかは要確認)
- `public/characters.json` (再生成、character.birthday が自動埋まる)

## Risks / Notes

- カレンダーの「擬人化N周年」と既存 `birthday.json` の日付がズレる可能性あり (例: nagoya 4/26 で N=10 → 2016-04-26、既存 JSON 一致)。差分が出たらカレンダー優先で更新する想定
- カレンダーのグレー表示セル (color:#CCCCCC) は前後月分なので必ず除外しないと重複する
- SHOP_ID_OVERRIDES は user が biccamera.com 側で店舗 ID を調べないと埋まらない。空のままでも既存挙動を退行しない
- 概念キャラ (biccamera/bicsim/naisen/oeraitan/air/photo/prosta/camera) は店舗 HTML が存在しないので引き続きスキップ。これは仕様
