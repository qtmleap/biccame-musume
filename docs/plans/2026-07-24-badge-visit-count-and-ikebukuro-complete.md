# Work Plan: 訪問マイルストーン & エリアコンプが解禁されないバグ修正

Date: 2026-07-24

## Goal

以下 2 件のバッジ判定バグを解消する。

1. **訪問マイルストーン（`milestone_visit_count_N`）が閉店店舗の訪問を無視して解禁されない** — カウント側が閉店店舗を無視する側に振れている（＝寛大側でない）
2. **エリアコンプ（`area_complete_*`）が閉店店舗込みで判定されているように見える** — 池袋（カメラ館・フォトスタジオ）や山陽・近畿（京都店）などで、閉店店舗にも行かないとコンプ扱いにならないというユーザー報告

どちらも `src/data/badges/registry.ts` の設計意図（**閉店店舗は集合系バッジ判定から除外し、閉店ぶんの過去訪問はマイルストーン側でだけ寛大に加算する**）と、実装／実挙動との齟齬。

## 前提: 閉店判定リスト

`src/data/badges/store-exclusion.ts` のヒューリスティック（`is_biccame_musume=true` かつ `store` 情報なし = 閉店）で `CLOSED_STORE_KEYS` に入るのは以下 7 店舗:

| storeKey | 店舗 |
| --- | --- |
| `camera` | 池袋東口カメラ館（閉店） |
| `photo` | フォトスタジオ（閉店） |
| `kyoto` | 京都店（閉店） |
| `funato` | 船戸店（閉店） |
| `machida` | 町田店（閉店） |
| `tamapla` | たまプラーザ店（閉店） |
| `seiseki` | 聖蹟店（閉店） |

**これらは実際に閉店した店舗** であり、ヒューリスティック判定は正しい。したがって:

- `area_complete_ikebukuro`（池袋）は **honten / pkan / ikenishi / prosta / itt の 5 店舗**（camera / photo を除く）で達成できるべき
- `area_complete_sanyo_kinki`（山陽・近畿）は **kyoto を除いた店舗** で達成できるべき
- 神奈川エリアも tamapla を除く、東京メトロも machida / seiseki を除く…と同様

---

## バグ 1: 訪問マイルストーンが閉店店舗を無視する

### 症状

ユーザーが `UserStore.status='visited'` を 40 件以上持っていても、`milestone_visit_count_40`（および 5/10/15/… 全ステップ）が解禁されないケースがある。訪問済みの中に閉店店舗が混ざっていると、その分がまったくカウントされない。

### 原因

`src/services/badge/snapshot.ts:88-94` と `src/services/badge/individual.ts:54-64`

```ts
const syncEvalCount = (s: UserSnapshot, meta: { count: number }): boolean => {
  let n = 0
  for (const k of ACTIVE_PHYSICAL_STORE_KEYS) {  // ← 閉店店舗を除いた集合でループ
    if (s.visitedStoreKeys.has(k)) n++
  }
  return n >= meta.count
}
```

`sub_category='count'` の判定が `ACTIVE_PHYSICAL_STORE_KEYS`（＝閉店店舗を除く現役店舗のみ）で訪問数を集計している。

### 設計意図との矛盾

`src/data/badges/registry.ts:236-238` のコメント（マイルストーン生成箇所）:

> milestone / conquest 系の閾値は現役店舗数を上限にする。
> **閉店店舗ぶんの過去訪問はカウント側では加算されるが（寛大側）**、
> 「N 店舗中 N 到達で mythic」の N が現役数を超えると永久未達になるのを防ぐ。

「閾値の上限を現役店舗数に揃える」のが本来の設計。カウント側は **閉店店舗の過去訪問も加算する（寛大側）** はず。実装が「閾値の上限」と「カウント対象」を混同している。

### 修正方針

`syncEvalCount` / `evaluateCount` のループ集合を `ACTIVE_PHYSICAL_STORE_KEYS` → `PHYSICAL_STORE_KEYS` に変更。

```ts
// snapshot.ts
const syncEvalCount = (s: UserSnapshot, meta: { count: number }): boolean => {
  let n = 0
  for (const k of PHYSICAL_STORE_KEYS) {  // 閉店店舗も含む全物理店舗
    if (s.visitedStoreKeys.has(k)) n++
  }
  return n >= meta.count
}
```

```ts
// individual.ts
export async function evaluateCount(ctx: EvaluatorContext, meta: { count: number }): Promise<boolean> {
  const count = await ctx.prisma.userStore.count({
    where: {
      userId: ctx.userId,
      storeKey: { in: PHYSICAL_STORE_KEYS as string[] },  // 変更
      status: 'visited'
    }
  })
  return count >= meta.count
}
```

### `event_clear_count` は要判断

`sub_category='event_clear_count'` も同じく `ACTIVE_PHYSICAL_STORE_KEYS` ベース（`snapshot.ts:115-121`, `individual.ts:123-138`）。イベント達成の場合は「閉店店舗で過去に達成したイベントもカウントするか？」の判断が必要。マイルストーンと同じ「寛大側」ルールを適用するなら同時に修正するのが自然。

### テスト

- 「閉店店舗 5 件 + 現役店舗 35 件を訪問済み」のユーザーで `milestone_visit_count_40` が解禁される
- 「現役店舗 40 件のみ訪問済み」のユーザーでも従来通り解禁される
- 上限側（`milestone_visit_count_all` の threshold が `physicalCount` = 現役店舗数）は変わらないことを確認

---

## バグ 2: エリアコンプが閉店店舗込みで判定されているように見える

### 症状（ユーザー報告）

- 池袋の現役 5 店舗（honten / pkan / ikenishi / prosta / itt）を全部訪問しても `area_complete_ikebukuro` が解禁されない
- 山陽・近畿エリアの京都店（閉店）を訪問しないと、同エリアの area_complete が解禁されない
- ほかエリア（神奈川 tamapla、東京メトロ machida / seiseki 等）でも同様の現象が起きている可能性

### 期待挙動（設計意図）

`src/services/badge/snapshot.ts:82-86` は `ACTIVE_PHYSICAL_STORE_KEYS.filter(...)` を使って **閉店店舗を除外した集合で判定** しているように読める:

```ts
const syncEvalAreaComplete = (s: UserSnapshot, meta: { region: BadgeArea }): boolean => {
  const keys = ACTIVE_PHYSICAL_STORE_KEYS.filter((k) => storeKeyToBadgeArea[k] === meta.region)
  if (keys.length === 0) return false
  return keys.every((k) => s.visitedStoreKeys.has(k))
}
```

これが正しく動いていれば、閉店店舗を訪問していなくても現役店舗さえ揃えばコンプ判定になるはず。しかしユーザー体感は逆。

### 原因の候補（要調査）

1. **`evaluateAndAwardBadges` の hot path が別のロジックを経由している**
   - `src/services/badge/index.ts` 側で snapshot 経由でない判定パスが残っていないか
   - 訪問／イベント完了フックの発火順序
2. **既存 `UserBadge` レコードが古いロジックで判定された状態のまま**
   - 「閉店店舗込み判定」が旧仕様として存在し、その時代に判定失敗したユーザーが再評価されていない可能性
   - 修正コミット (`ddd359b`, `978b7a1` など) 以前の状態が残っていないか
3. **UI 側の進捗表示が PHYSICAL ベースで、ユーザーが「5/7」表示を見て未コンプと誤解**
   - この場合はバッジ自体は解禁されているはず → ユーザーの `UserBadge` テーブルを直接確認して切り分け
4. **エリアコンプ関連の別バッジ（`event_clear_area_complete_*`）と混同**
   - こちらも `snapshot.ts:109-113` で `ACTIVE_PHYSICAL_STORE_KEYS` ベース。挙動は同じはず

### 調査タスク

1. **実データ確認**: 池袋現役 5 店舗すべてを `visited` にした test user を作り、`area_complete_ikebukuro` が付与されるか確認（DB レベル）
2. **UI 進捗表示のロジック確認**: エリア進捗を表示する UI コンポーネント（`/badges` 配下、マイページ内エリア進捗など）が `PHYSICAL_STORE_KEYS` / `ACTIVE_PHYSICAL_STORE_KEYS` のどちらを使っているか grep で洗う
3. **`evaluateAndAwardBadges` の hot path 全経路確認**: `snapshot.ts` の SYNC_EVALUATORS 経由以外に area_complete を判定している場所がないか
4. **既存 UserBadge レコードの再評価バッチ要否**: 対象ユーザー数を数え、必要なら手動発火する CLI or scheduled task を用意

### 修正方針（原因ごとに分岐）

- 原因が **UI 進捗表示** なら、UI 側の進捗計算を `ACTIVE_PHYSICAL_STORE_KEYS` ベースに揃える（バックエンド判定と同じ集合を使う）
- 原因が **hot path のバグ** なら該当箇所を `ACTIVE_PHYSICAL_STORE_KEYS` ベースに修正
- 原因が **既存レコード未再評価** なら再評価バッチを流す
- どのケースでも「閉店店舗を除いた現役店舗のみでコンプ判定」の原則を UI / 判定 / 表示すべてに徹底する

### テスト

- 池袋現役 5 店舗を訪問済み、camera / photo は未訪問のユーザーで `area_complete_ikebukuro` が付与される
- 山陽・近畿の現役店舗を訪問済み、kyoto は未訪問のユーザーで `area_complete_sanyo_kinki` が付与される
- 神奈川で tamapla 未訪問、東京メトロで machida / seiseki 未訪問でもコンプが取れる
- UI のエリア進捗表示が「N/N」（現役ベース）で表示されコンプ判定と一致

---

## 実装順序

1. **バグ 1（訪問マイルストーン）修正** — 影響範囲が snapshot.ts / individual.ts に閉じており低リスク
   - `snapshot.ts` / `individual.ts` の `sub_category='count'` ループ集合を PHYSICAL に変更
   - `event_clear_count` を同じルールにするか判断し、決定したら同時に修正
   - Unit test 追加（`test/services/badge/` 配下）
2. **バグ 2 の原因究明** — まず切り分けが必要
   - 上記「調査タスク」1〜4 を順に実施
   - 原因特定後に修正方針を確定して別 plan or 同一 plan で修正
3. **修正後の遡及付与** — `evaluateAndAwardBadges` は訪問／イベント完了などのアクションで再評価される想定
   - 全ユーザー一括再評価バッチが必要かは、対象数と Workers サブリクエスト上限を勘案

## ブランチ

`fix/badge-count-and-area-complete`（現在の `fix/comment-user-id-leak` とは別作業）

## 影響ファイル（想定）

- `src/services/badge/snapshot.ts`
- `src/services/badge/individual.ts`
- `src/services/badge/index.ts`（hot path 調査結果次第）
- UI 側のエリア進捗コンポーネント（調査で特定）
- `test/services/badge/*`（新規または追記）
