# Work Plan: バッジデータモデル & 獲得判定

Date: 2026-05-06

## Goal

ビックカメラ 11 周年キャンペーンを念頭に、**店舗訪問・イベント参加・店舗別イベント達成・投票**を軸としたバッジ獲得システムを設計・実装する。`/badges` ルートのモック ([2026-05-06 commit b7bf3ab](../../src/app/routes/badges/index.tsx)) を実データへ移行し、Prisma で `Badge` / `UserBadge` を管理、店舗訪問・イベント完了・投票成立のフックで同期判定する。

## バッジ一覧 (MVP)

### エリア定義 (バッジ用 / 全 10 地区)

ビックカメラ公式 11 周年キャンペーン ([campaign URL](https://www.biccamera.com/bc/c/campaign/biccame11th_badge/index.jsp)) の地区区分にそのまま揃える。既存の filter 用 5 region (`hokkaido` / `kanto` / `chubu` / `kansai` / `kyushu`) は filter 用途で温存し、**バッジ用 area は別レイヤ**として追加。

| キー | 地区名 | 主な店舗 (campaign 範囲) |
| --- | --- | --- |
| `hokkaido` | 北海道地区 | 札幌 |
| `kanto_north` | 埼玉・茨城・群馬・新潟地区 | 大宮西口 / 所沢 / 水戸 / 高崎 / 新潟 |
| `chiba` | 千葉地区 | 千葉駅前 / 船橋FACE / 柏 |
| `tokyo_metro` | 東京地区 | 京王調布 / 聖蹟 / 立川 / 八王子 / 町田 / 有楽町 / アキバ / 赤坂見附 |
| `shinjuku_shibuya` | 新宿・渋谷地区 | 新宿東口 / 新宿西口 / 新宿東口駅前 / 渋谷ハチ公口 / 渋谷東口 |
| `ikebukuro` | 池袋地区 | 池袋本店 / カメラ館 / パソコン館 / 西口 / フォトスタジオ / IT tower |
| `kanagawa` | 神奈川地区 | 相模大野 / たまプラーザ / 川崎 / 新横浜 / 横浜西口 / 藤沢 |
| `chubu` | 中部地区 | 浜松 / 名古屋JRゲート / 名古屋駅西 |
| `sanyo_kinki` | 山陽・近畿地区 | 広島 / 岡山 / なんば / 京都 / 高槻 / あべの / 八尾 |
| `kyushu` | 九州地区 | 天神 1 号 / 天神 2 号 / 鹿児島 / 熊本 |

- キャンペーン対象外の実店舗は最寄り地区に振り分け (registry.ts で明示マッピング、テストで網羅性確認)
- `prefectureToRegion` (既存) は filter UI のままにしておき、バッジでは新規の `storeKeyToBadgeArea` マップを使う

### 店舗系 (約 80 個)

| カテゴリ | 件数 | 条件 | レアリティ |
| --- | --- | --- | --- |
| 各店舗訪問 | 50 | `UserStore.status='visited'` がその店舗で 1 件以上 | common |
| エリア参加 (10) | 10 | その地区で `visited` が 1 件以上 | rare |
| エリアコンプ (10) | 10 | その地区の全店舗 `visited` | epic |
| マイルストーン | 約 9 | 累計 `visited` ユニーク店舗数が 5/10/15/.../X (X = 実店舗数未満で最大の 5 の倍数) | common→rare→epic |
| 全店制覇 | 1 | 全店舗 `visited` (= 実店舗数。マイルストーン最大値の次の段階) | legendary |
| メタバッジ「全国デビュー」 | 1 | 全 10 地区それぞれで 1 店舗以上 `visited` | epic |

**マイルストーンの段階数ルール (店舗 / 多様性で共通):**
- 母数 N に対し 5 の倍数で 5, 10, 15, ..., M (M = N 未満で最大の 5 の倍数) までを segment milestone とする
- N そのものを「コンプバッジ」(legendary) として別途 1 個。マイルストーン最高段とは重複させない
- 例: 実店舗 47 → 5/10/.../45 (9 個) + コンプ 47 (1 個)
- 例: 実店舗 50 → 5/10/.../45 (9 個) + コンプ 50 (1 個)
- 例: 実店舗 51 → 5/10/.../50 (10 個) + コンプ 51 (1 個)

#### 実店舗の絞り込み

`StoreKeySchema` の中にはサービス系・概念キーが混在 (`biccamera`, `bicsim`, `naisen`, `oeraitan` 等)。バッジ対象は **`stores.yaml` 等の店舗マスタで `prefecture` を持つ実店舗のみ**に絞る。除外リストは `src/data/badges/store-exclusion.ts` で明示し、テストで「除外リスト + 実店舗 = 全 StoreKey」をアサート。

### イベント参加系 (31 個)

「イベントを何件こなしたか」(店舗を問わない総件数)。コンプ概念なし。

混合ステップラダー (計 31 エントリ):
- 1, 5 (低閾値エントリ 2 件)
- 10–100 (10 刻み、10 件)
- 125–575 (25 刻み、19 件)

レアリティ配分:
- common: 1, 5, 10, 20, 30 (5 件)
- rare: 40–100 (7 件、10 刻み)
- epic: 125–300 (8 件、25 刻み)
- legendary: 325–575 (11 件、25 刻み)

特記:
- `event_count_50`「イベントの主」は rare (以前の旧 legendary から引き続き変更なし)
- `event_count_575`「イベント極み」が新たな legendary ピーク
- 旧 `event_count_570` は廃止 (DB から削除済み)

### 店舗別イベント達成系 (81 個 → 3 カテゴリに分割)

「**その店舗で開催されたイベントを完了 (`UserEvent.status='completed'`)**」を条件とする系列。訪問バッジの上位互換的ポジション (訪問 < イベントクリア)。判定式は「completed なイベントが、その店舗を `EventStore` リレーションに持つか」。エリア区分は店舗訪問系と同じ 10 地区。

#### 各店舗イベント参加 (`event_clear_store`, 50 個)

| カテゴリ | 件数 | 条件 | レアリティ |
| --- | --- | --- | --- |
| 各店舗イベント制覇 | 50 | その店舗で開催されたイベントを 1 件以上 completed | rare |

#### エリアイベント参加 (`event_clear_area`, 20 個)

| カテゴリ | 件数 | 条件 | レアリティ |
| --- | --- | --- | --- |
| エリアイベントデビュー (10) | 10 | その地区の店舗で 1 件以上 イベント completed | epic |
| エリアイベントコンプ (10) | 10 | その地区の全店舗でイベント completed | legendary |

#### マイルストーン統合 (`milestone`, visit 11 + event_clear 11 = 22 個)

イベント制覇マイルストーン・全店制覇・メタバッジは訪問系マイルストーンと同じ `milestone` カテゴリに統合。

| 件数 | 条件 | レアリティ |
| --- | --- | --- |
| 約 9 | イベント完了したユニーク店舗数が 5/10/15/.../X (X = 実店舗数未満で最大の 5 倍数) | common→rare→epic |
| 1 | 全実店舗でイベント completed | legendary |
| 1 | 全 10 地区それぞれで 1 件以上イベント completed (メタバッジ「全国達成」) | legendary |

**命名規約 (訪問系との区別):**
- 訪問系の動詞: 「訪問」「参加」「コンプ」
- イベント達成系の動詞: 「制覇」「達成」
- 例: 訪問→「秋葉原店訪問」、イベント達成→「秋葉原店制覇」
- 例: 訪問→「関東コンプ」、イベント達成→「関東制覇」

### 投票系 (20 個)

「ちまちま投票してれば自然に届く」「強要しない」がコンセプト。**ストリーク (連続 X 日) や時限制限は採用しない**。累計票数の一軸のみ。

| サブカテゴリ | 名称 | 条件 | レアリティ |
| --- | --- | --- | --- |
| 累計票数 | 初投票 | 累計 1 票 | common |
| 累計票数 | 投票 10 票 | 累計 10 票 | common |
| 累計票数 | 投票 20 票 | 累計 20 票 | common |
| 累計票数 | 投票 30 票 | 累計 30 票 | common |
| 累計票数 | 投票 40 票 | 累計 40 票 | common |
| 累計票数 | 投票 50 票 | 累計 50 票 | common |
| 累計票数 | 投票 60 票 | 累計 60 票 | rare |
| 累計票数 | 投票 70 票 | 累計 70 票 | rare |
| 累計票数 | 投票 80 票 | 累計 80 票 | rare |
| 累計票数 | 投票 90 票 | 累計 90 票 | rare |
| 累計票数 | 投票熟練 | 累計 100 票 | rare |
| 累計票数 | 投票 200 票 | 累計 200 票 | epic |
| 累計票数 | 投票 300 票 | 累計 300 票 | epic |
| 累計票数 | 投票 400 票 | 累計 400 票 | epic |
| 累計票数 | 票職人 | 累計 500 票 | epic |
| 累計票数 | 投票 600 票 | 累計 600 票 | epic |
| 累計票数 | 投票 700 票 | 累計 700 票 | legendary |
| 累計票数 | 投票 800 票 | 累計 800 票 | legendary |
| 累計票数 | 投票 900 票 | 累計 900 票 | legendary |
| 累計票数 | 投票名人 | 累計 1000 票 | legendary |

**設計メモ:**
- 累計票数のみの一軸構成 (20 段)。1〜50 は 10 刻み (common)、60〜100 は 10 刻み (rare)、200〜600 は 100 刻み (epic)、700〜1000 は 100 刻み (legendary)
- 名前付きの特別枠: 初投票 (1)、投票熟練 (100)、票職人 (500)、投票名人 (1000)
- 多様性軸 (`vote_unique`) と推し愛軸 (`vote_devotion`) は廃止。cumulative 票数だけで十分シンプル

### 特別イベント (コラボ・限定企画)

`category='special'` で**店舗単独の達成では出ない、横断的・限定的な条件**のバッジ枠。**コードを変更せず admin UI から店舗を選んで追加できる**ようにする。コラボは新宿だけでなくいつでも・どの組み合わせでも企画される前提。

| サブカテゴリ | 用途 | 条件メタ |
| --- | --- | --- |
| `special_multi_store_clear` | 指定された複数店舗群**すべて**でイベント clear | `{ storeKeys: StoreKey[] }` |
| `special_event_id` | 指定された特定 event を clear | `{ eventId: string }` |

#### admin UI で完結させる仕組み

- `/control_panel/badges` (Cloudflare Access 保護、memory `project_admin_auth.md` 参照) に「特別バッジ作成」フォームを設置
- フォーム項目:
  - 名称 / 説明 / ヒント (必須)
  - レアリティ (`common` / `rare` / `epic` / `legendary` のセレクト)
  - サブカテゴリ (`special_multi_store_clear` / `special_event_id` のセレクト)
  - 対象 storeKey (multi-select、`special_multi_store_clear` 選択時のみ表示)
  - 対象 eventId (event 検索、`special_event_id` 選択時のみ表示)
  - アイコン (lucide 名のセレクト or 既定の星アイコン)
- 保存時に `code` を slug 自動生成 (例: `special_collab_${nanoid(6)}`)、`Badge` テーブルへ insert
- 一覧画面で削除・編集も可能 (削除時は `UserBadge` も cascade)

#### registry seeder との共存

- registry.ts は `category != 'special'` のバッジのみ管理 (上書き)
- `category = 'special'` のレコードは admin が作成するためシードで触らない
- seeder の upsert は **`code` のドメイン (例: `store_visit_*`, `area_*`, `milestone_*`, `event_count_*`, `event_clear_*`, `vote_*`) を whitelist** にし、それ以外のレコードは保持

#### コラボ例 (admin が登録するイメージ)

| 名称 | サブカテゴリ | 条件 | レアリティ |
| --- | --- | --- | --- |
| 新宿コラボ達成 | `special_multi_store_clear` | 新宿 3 店舗すべてで event clear | epic |
| 渋谷ペア達成 | `special_multi_store_clear` | 渋谷 2 店舗で event clear | rare |
| 池袋総力戦 | `special_multi_store_clear` | 池袋地区全店で event clear | legendary |

- MVP 開始時点では 0 個 (admin が後追いで作成)
- 命名はポジティブ語のみ (memory `feedback_positive_naming.md`)

**MVP 合計: 213 バッジ** (店舗訪問 50 + エリア訪問 20 + マイルストーン 22 [visit 11 + event_clear 11] + イベント参加 31 + 各店舗イベント参加 50 + エリアイベント参加 20 + 投票 20。実店舗数で前後)

## データモデル

### Prisma 追加 (要マイグレーション)

```prisma
/// バッジ定義 (静的・シードで投入)
model Badge {
  /// バッジコード (例: 'store_visit_akiba', 'area_complete_kanto', 'store_milestone_10')
  code         String   @id
  /// カテゴリ: 'store' | 'area' | 'milestone' | 'event' | 'event_clear_store' | 'event_clear_area' | 'vote' | 'special'
  category     String
  /// サブカテゴリ: 'visit' | 'area_any' | 'area_complete' | 'count' | 'event_count' | 'event_clear_at_store' | 'event_clear_area_any' | 'event_clear_area_complete' | 'event_clear_count' | 'event_clear_all' | 'vote_total'
  subCategory  String   @map("sub_category")
  /// 表示名
  name         String
  /// 説明 (獲得後に表示)
  description  String
  /// ヒント (未獲得時に表示)
  hint         String
  /// レアリティ: 'common' | 'rare' | 'epic' | 'legendary'
  rarity       String
  /// アイコン名 (lucide-react のコンポーネント名)
  iconName     String   @map("icon_name")
  /// 並び順 (カテゴリ内ソート用)
  sortOrder    Int      @map("sort_order")
  /// 条件メタ (JSON 文字列): { storeKey?, region?, count?, eventCount?, storeKeys?, eventId? }
  conditionMeta String  @map("condition_meta")
  /// 表示・判定を OFF にするフラグ (admin で切り替え可能)
  isHidden     Boolean  @default(false) @map("is_hidden")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  userBadges   UserBadge[]

  @@index([category])
  @@map("badges")
}

/// ユーザーが獲得したバッジ
model UserBadge {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  badgeCode String   @map("badge_code")
  earnedAt  DateTime @default(now()) @map("earned_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  badge     Badge    @relation(fields: [badgeCode], references: [code], onDelete: Cascade)

  @@unique([userId, badgeCode])
  @@index([userId])
  @@index([badgeCode])
  @@map("user_badges")
}
```

**マイグレーション必須**: `prisma migrate diff` 経由で発行する (直接 SQL 禁止のプロジェクトルール)。

### バッジ生成 (シードではなくコード由来)

`Badge` は手書きしない。`src/data/badges/registry.ts` で次のような generator を実装し、**全店舗マスタ + 全エリアから機械的に展開**する:

```ts
type BadgeDef = {
  code: string
  category: 'store' | 'area' | 'milestone' | 'event' | 'event_clear_store' | 'event_clear_area' | 'vote' | 'special'
  subCategory:
    | 'visit' | 'area_any' | 'area_complete' | 'count'
    | 'event_count'
    | 'event_clear_at_store' | 'event_clear_area_any' | 'event_clear_area_complete' | 'event_clear_count' | 'event_clear_all'
    | 'all_areas_any_visit' | 'all_areas_any_event_clear'
    | 'vote_total'
    | 'special_multi_store_clear' | 'special_event_id'
  conditionMeta: { storeKey?: StoreKey; region?: Region; count?: number; storeKeys?: StoreKey[]; eventId?: string }
  // ... name/description/hint/rarity/iconName/sortOrder
}
```

シードコマンドは `bun run badges:seed` で `Badge` テーブルを upsert (起動時の冪等性確保)。本番投入は `predeploy` フックに組み込む。

## 判定ロジック

### Evaluator パターン

`src/services/badge-evaluator.ts` に subCategory ごとの evaluator を実装:

| subCategory | 判定入力 | 判定式 |
| --- | --- | --- |
| `visit` | `userId, storeKey` | `UserStore` に visited が存在するか |
| `area_any` | `userId, region` | そのエリアの店舗で 1 件以上 visited |
| `area_complete` | `userId, region` | そのエリアの店舗をすべて visited |
| `count` | `userId, count` | 累計ユニーク visited 店舗数 ≥ count |
| `event_count` | `userId, count` | `UserEvent.status='completed'` の件数 ≥ count |
| `event_clear_at_store` | `userId, storeKey` | `UserEvent.status='completed'` で `EventStore.storeKey=X` を持つ event が 1 件以上 |
| `event_clear_area_any` | `userId, region` | そのエリアの店舗で 1 件以上 event clear |
| `event_clear_area_complete` | `userId, region` | そのエリアの全店舗で event clear |
| `event_clear_count` | `userId, count` | event clear したユニーク店舗数 ≥ count |
| `event_clear_all` | `userId` | 全実店舗で event clear |
| `all_areas_any_visit` | `userId` | 全 10 BadgeArea でそれぞれ 1 件以上 visited |
| `all_areas_any_event_clear` | `userId` | 全 10 BadgeArea でそれぞれ 1 件以上 event clear |
| `vote_total` | `userId, count` | `Vote` テーブルの行数 ≥ count |
| `special_multi_store_clear` | `userId, storeKeys` | 指定された全 storeKey で event clear (= AND 条件) |
| `special_event_id` | `userId, eventId` | その event ID が `UserEvent.completed` に存在 |

各 evaluator は `(env, userId, conditionMeta) => Promise<boolean>` の純粋関数。

### 実行タイミング

**フック方式 (推奨)**: 既存の以下エンドポイントの onSuccess で関連バッジを評価:

- `PUT /api/users/me/stores/:storeKey` (status='visited' のとき)
  - 評価対象: `visit[storeKey]`, `area_any[region(storeKey)]`, `area_complete[region(storeKey)]`, `count[*]`, `legendary 全店制覇`
- `PUT /api/users/me/events/:eventId` (status='completed' のとき)
  - 評価対象: `event_count[*]`, さらに該当 event の `EventStore` に紐づく全 `storeKey` に対して: `event_clear_at_store[storeKey]`, `event_clear_area_any[region]`, `event_clear_area_complete[region]`, `event_clear_count[*]`, `event_clear_all`, `special_event_id[eventId]`, `special_multi_store_clear[該当 storeKey 含むもの全部]`
- `POST /api/votes` (投票が成立したとき)
  - 評価対象: `vote_total[*]`, `vote_unique[*]`, `vote_devotion[投票先キャラのみ]`, `vote_all_biccame`

すでに獲得済みのバッジは判定スキップ。新規獲得は `UserBadge` に insert + 型のあるレスポンス `{ newBadges: Badge[] }` を返却し、フロントで toast ポップアップ。

**バックグラウンドではなく同期**で評価する (D1 + Workers の特性上、cron/queue より同期評価のほうが simple)。

### 遡及付与 (バックフィル)

リリース時に既存ユーザーの `visited` / `completed` から判定:

- `scripts/backfill-badges.ts` を作成
- 全ユーザーをスキャンし、`evaluateAllBadges(env, userId)` を呼ぶ
- `bun run badges:backfill` で実行
- 冪等 (UNIQUE 制約により重複 insert は無視)

## API

### 新規エンドポイント

```
GET  /api/badges                  全バッジ定義 (静的・キャッシュ可)
GET  /api/users/me/badges         自分の獲得状況
GET  /api/badges/leaderboard      集計ランキング (上位 N 件 + 自分の順位)
```

#### `/api/users/me/badges` レスポンス

```ts
{
  earned: Array<{ code: string; earnedAt: string }>
  // 全バッジ定義は /api/badges からマージ
}
```

#### `/api/badges/leaderboard` レスポンス

```ts
{
  top: Array<{ uid: string; displayName: string; thumbnailURL?: string; earnedCount: number; rank: number }>
  me?: { rank: number; earnedCount: number }
}
```

### 集計クエリ

集計テーブルは作らず、毎回オンデマンドで集計 (D1 で十分):

```sql
SELECT user_id, COUNT(*) AS earned_count
FROM user_badges
GROUP BY user_id
ORDER BY earned_count DESC, MIN(earned_at) ASC
LIMIT 50;
```

`MIN(earned_at)` でタイブレーク (早く到達した方が上位)。自分の順位は `COUNT(*)+1 WHERE earned_count > my_count`。

## UI 移行

モックを TanStack Query 化:

- `src/hooks/use-badges.ts` (`useSuspenseQuery` で `/api/users/me/badges` + `/api/badges`)
- `src/hooks/use-badge-leaderboard.ts` (`/api/badges/leaderboard`)
- `src/data/badges.mock.ts` を削除、`src/components/badges/` は props 経由でデータ受け取りなので変更最小

### 追加 UI

- ヘッダーナビに `/badges` リンク (Award アイコン)。ログイン時のみ表示。
- 店舗詳細 (`/location?store=...` 周辺) に「未獲得バッジ」表示
- 獲得時の toast (`bun run dev` で sonner 経由)
- グリッドが約 182 マスになるので、**店舗訪問・店舗別イベント達成カテゴリは 10 地区ごとにサブセクション分割** (北海道 / 埼玉・茨城・群馬・新潟 / 千葉 / 東京 / 新宿・渋谷 / 池袋 / 神奈川 / 中部 / 山陽・近畿 / 九州)。投票系は軸ごと (累計 / 多様性 / 推し愛) のサブセクション
- 同じ店舗の「訪問」と「制覇」を**並べて見せる**レイアウト案 (各店舗カードを縦 2 段で訪問→制覇に展開) も検討

## 認証/認可

- `GET /api/users/me/badges` は要 Firebase Auth (既存の middleware を流用)
- `GET /api/badges/leaderboard` は public (将来非表示ユーザー対応はカラム追加で)
- `GET /api/badges` は public + 長期 cache

## Tasks

### Backend

- [x] Prisma スキーマに `Badge` / `UserBadge` 追加 + マイグレーション (`prisma migrate diff`)
- [x] `src/data/badges/store-exclusion.ts` で実店舗以外を列挙 + テストでスキーマと突き合わせ
- [x] `src/data/badges/registry.ts` で全バッジ定義を生成
- [x] `bun run badges:seed` スクリプト (upsert で Badge テーブル投入、`category='special'` は触らない、auto-generated でも admin が編集した表示フィールドは保持)
- [x] `POST/PATCH/DELETE /api/admin/badges` (special バッジの全項目 CRUD)
- [x] `PATCH /api/admin/badges/:code` (auto-generated バッジは表示フィールドのみ編集 = name/description/hint/iconName/rarity/sortOrder/isHidden)
- [x] `src/services/badge-evaluator.ts` で subCategory 別 evaluator 実装
- [x] `src/services/badge-evaluator.ts` に `evaluateOnVisit` / `evaluateOnEventComplete` / `evaluateOnVote` ヘルパー
- [x] 既存の `PUT /api/users/me/stores/:storeKey` に評価フック追加 + 新規バッジ返却
- [x] 既存の `PUT /api/users/me/events/:eventId` に評価フック追加 + 新規バッジ返却
- [x] 既存の `POST /api/votes` (一括投票含む) に評価フック追加 + 新規バッジ返却
- [x] `GET /api/badges`, `GET /api/users/me/badges`, `GET /api/badges/leaderboard` 実装
- [x] `scripts/backfill-badges.ts` (全ユーザー一括判定)
- [x] OpenAPI spec / Zod スキーマ整備

### Frontend

- [x] `src/hooks/use-badges.ts` (`useSuspenseQuery` 2 つ束ねる)
- [x] `src/hooks/use-badge-leaderboard.ts`
- [x] `src/data/badges.mock.ts` を削除し、components/badges/ をフック経由で接続
- [x] アイコンは `iconName` 文字列 → lucide コンポーネント参照のマッピング表 (`src/lib/badge-icons.ts`)
- [ ] 店舗カテゴリの**エリアサブセクション化** (3 列 × 多段でも視認性を保つ) — `BADGE_CATEGORY_DEFS` でカテゴリ単位の分割は実装済、エリアサブセクションは Phase 6 で
- [x] 獲得時 toast (店舗訪問/イベント完了 mutation の onSuccess で分岐)
- [x] ヘッダー nav に `/badges` 追加 (ログイン時のみ)
- [x] `/admin/badges` 管理画面 (一覧 / 作成 (special のみ) / 編集 / 削除 (special のみ)、storeKey multi-select & event 検索付き)
- [x] `/admin` トップに「バッジ管理」`MenuCard` 追加 (既存の「イベント管理」と並べる)

### QA

- [x] Evaluator のユニットテスト (各 subCategory ごとに境界値)
- [x] バックフィル冪等性のテスト
- [x] リーダーボードの順位計算 (タイブレーク含む) のテスト
- [ ] e2e: ログイン → 店舗訪問 → 該当バッジが UI に出現 — TODO スタブのみ (`e2e/badges-flow.spec.ts`, Firebase エミュレータ + 認証セットアップ要)
- [x] biome / tsc / `bun test` 全パス (88 テスト pass、メタバッジ追加後も同数)

## 設計原則 (バッジ全体)

- **ストリーク・連続日数を要求しない** ("連続 X 日" の発想は採らない)。アプリの温度感「パッと入力、たまに見返す」(memory `feedback_app_philosophy.md`) と矛盾するため
- 全バッジは**累計・多様性・愛着**のいずれかの軸で「ちまちまやれば自然に届く」ように設計
- レアリティの上限は「ヘビーユーザーなら数ヶ月で届く」程度に。**コンプを目標にしないでも遊べる**ことを優先
- ラベル・名称はポジティブ語のみ (memory `feedback_positive_naming.md`)

## 未確定事項 (実装中に詰める)

- 店舗マスタ (`stores.yaml` 等) のうち実店舗判定の根拠 → `prefecture` 必須でよいか
- 多様性最終段とコンプの関係: 全 50 人なら 5/10/.../45 + 全員推し 50 で確定。51 人になったら 50 マイルストーンが新たに発生 (生やすか / マイグレで再判定するかは Phase 2)
- アイコン採用方針: lucide で全 ~182 個分けるか、店舗系 (訪問 / 制覇) は地図ピン共通＋色違いで区別など節約するか

## admin での編集ポリシー (A 案で確定)

複雑性を抑えるため、「**条件式は code が持つ・表示は admin が触れる**」の二層構造で割る。

| バッジの種類 | code 編集可否 | 表示フィールド (name / description / hint / iconName / rarity / sortOrder / isHidden) | 条件 (subCategory / conditionMeta) |
| --- | --- | --- | --- |
| auto-generated (店舗 / エリア / マイルストーン / イベント参加 / 店舗別イベント / 投票) | × (registry が固定) | ○ admin で編集可 (registry seed は表示フィールドを上書きしない) | × (コード変更 + デプロイが必要) |
| special (コラボ・限定企画) | ○ admin が新規発行時に slug 自動生成 | ○ 全項目 admin で編集可 | ○ admin で storeKeys / eventId を選択 |

- スレッショルド調整 (例: 票職人 500 → 1000) は registry 改修 + マイグレ + バックフィル再実行で対応 (admin では変更させない)
- 既存バッジを「ちょっと隠したい」運用には `isHidden` フラグで対応 (Badge 行に列追加。表示・判定 OFF)
- registry seeder は upsert 時に `name / description / hint / iconName / rarity / sortOrder / isHidden` を**書き換えない** (= admin の編集を温存)。書き換えるのは構造 (code / category / subCategory / conditionMeta) のみ
- キャンペーン対象外の実店舗 (例: ビッグカメラ単独店で campaign に未掲載のもの) を 10 地区のどこへ振るかの個別判断 (registry.ts のマップで明示)
- リーダーボードの匿名表示オプト (Phase 2)

## ステップ実装順

1. Prisma 拡張 + registry.ts でバッジ定義 (Frontend のフックは mock 維持)
2. 評価ロジック + シード + バックフィル
3. API 3 本 + フロント接続
4. UI 仕上げ (toast / nav / エリアサブセクション)
