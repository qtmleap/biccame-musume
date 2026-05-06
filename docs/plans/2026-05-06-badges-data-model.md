# Work Plan: バッジデータモデル & 獲得判定

Date: 2026-05-06

## Goal

ビックカメラ 11 周年キャンペーンを念頭に、店舗訪問とイベント参加に基づくバッジ獲得システムを設計・実装する。`/badges` ルートのモック ([2026-05-06 commit b7bf3ab](../../src/app/routes/badges/index.tsx)) を実データへ移行し、Prisma で `Badge` / `UserBadge` を管理、店舗訪問・イベント参加のフックで非同期判定する。

## バッジ一覧 (MVP)

### 店舗系 (約 71 個)

| カテゴリ | 件数 | 条件 | レアリティ |
| --- | --- | --- | --- |
| 各店舗訪問 | 約 50 | `UserStore.status='visited'` がその店舗で 1 件以上 | common |
| エリア参加 (5) | 5 | そのエリアで `visited` が 1 件以上 (北海道/関東/中部/関西/九州) | rare |
| エリアコンプ (5) | 5 | そのエリアの全店舗 `visited` | epic |
| マイルストーン | 10 | 累計 `visited` ユニーク店舗数が 5/10/15/.../50 | common→rare→epic |
| 全店制覇 | 1 | 全店舗 `visited` (実店舗のみ、後述の除外リスト適用後) | legendary |

#### 実店舗の絞り込み

`StoreKeySchema` の中にはサービス系・概念キーが混在 (`biccamera`, `bicqlo`, `bicsim`, `camera`, `photo`, `pkan`, `prosta`, `naisen`, `itt`, `oeraitan` 等)。バッジ対象は **`stores.yaml` 等の店舗マスタで `prefecture` を持つ実店舗のみ**に絞る。除外リストは `src/data/badges/store-exclusion.ts` で明示し、テストで「除外リスト + 実店舗 = 全 StoreKey」をアサート。

### イベント系 (5 個)

| 名称 | 条件 | レアリティ |
| --- | --- | --- |
| はじめてのイベント | `UserEvent.status='completed'` が 1 件 | common |
| 常連さん | 5 件 | rare |
| イベントマスター | 10 件 | rare |
| イベント愛好家 | 20 件 | epic |
| イベントの主 | 50 件 | legendary |

コンプ概念なし。

### 投票系 (11 個)

「ちまちま投票してれば自然に届く」「強要しない」がコンセプト。**ストリーク (連続 X 日) や時限制限は採用しない**。すべて累計・多様性・愛着の積み上げ系。

| サブカテゴリ | 名称 | 条件 | レアリティ |
| --- | --- | --- | --- |
| 累計票数 | 初投票 | 累計 1 票 | common |
| 累計票数 | 投票デビュー | 累計 10 票 | common |
| 累計票数 | 投票上手 | 累計 50 票 | rare |
| 累計票数 | 投票熟練 | 累計 100 票 | rare |
| 累計票数 | 票職人 | 累計 500 票 | epic |
| 多様性 | 推しが増えた | 異なる 3 キャラに投票 | common |
| 多様性 | 推し広め隊 | 異なる 11 キャラに投票 | rare |
| 多様性 | 全員推し | ビッカメ娘全キャラに 1 票以上 | legendary |
| 推し愛 | 推し決定 | 同一キャラに累計 10 票 | common |
| 推し愛 | 推し一筋 | 同一キャラに累計 100 票 | epic |
| 一括投票 | みんなに一票 | 「ビッカメ娘全員に投票」を一度でも実行 | rare |

**設計メモ:**
- 上限は 500 票で打ち止め (1000 はちまちま勢には遠すぎる)
- 「全員推し」は legendary だがあくまで自然な配票で届く範囲。"全員" の母集団は「現時点で `is_biccame_musume=true` のキャラ」に対してのみ判定
- 「みんなに一票」は既存の `BulkVoteButton` 経由でも単発投票の累積でも OK (実質「全員推し」と同条件で、片方は手段問わず・もう片方は一括ボタン明示)。…と思ったが冗長になるので **一括投票専用フラグ** (Vote 行に `via_bulk` 列追加 or アクションログ) で区別する。**MVP では「みんなに一票」=「全員推し」と統合してドロップ**し、10 個に絞る案も Plan として保持。

### 11 周年限定 (将来拡張用、MVP では空)

`category='anniversary'` で枠だけ用意。MVP では 0 件、後続でハードコード追加可能に。

**MVP 合計: 約 86 バッジ** (店舗 71 + イベント 5 + 投票 10〜11)

## データモデル

### Prisma 追加 (要マイグレーション)

```prisma
/// バッジ定義 (静的・シードで投入)
model Badge {
  /// バッジコード (例: 'store_visit_akiba', 'area_complete_kanto', 'store_milestone_10')
  code         String   @id
  /// カテゴリ: 'store' | 'area' | 'milestone' | 'event' | 'vote' | 'anniversary'
  category     String
  /// サブカテゴリ: 'visit' | 'area_any' | 'area_complete' | 'count' | 'event_count' | 'vote_total' | 'vote_unique' | 'vote_devotion' | 'vote_bulk' 等
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
  /// 条件メタ (JSON 文字列): { storeKey?, region?, count?, eventCount? }
  conditionMeta String  @map("condition_meta")
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
  category: 'store' | 'area' | 'milestone' | 'event' | 'anniversary'
  subCategory: 'visit' | 'area_any' | 'area_complete' | 'count' | 'event_count'
  conditionMeta: { storeKey?: StoreKey; region?: Region; count?: number }
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
| `vote_total` | `userId, count` | `Vote` テーブルの行数 ≥ count |
| `vote_unique` | `userId, count` | `COUNT(DISTINCT character_id)` ≥ count |
| `vote_devotion` | `userId, count` | 単一キャラへの票数の最大値 ≥ count |
| `vote_unique_all_biccame` | `userId` | 現在の `is_biccame_musume=true` 全キャラに各 1 票以上 |

各 evaluator は `(env, userId, conditionMeta) => Promise<boolean>` の純粋関数。

### 実行タイミング

**フック方式 (推奨)**: 既存の以下エンドポイントの onSuccess で関連バッジを評価:

- `PUT /api/users/me/stores/:storeKey` (status='visited' のとき)
  - 評価対象: `visit[storeKey]`, `area_any[region(storeKey)]`, `area_complete[region(storeKey)]`, `count[*]`, `legendary 全店制覇`
- `PUT /api/users/me/events/:eventId` (status='completed' のとき)
  - 評価対象: `event_count[*]`
- `POST /api/votes` (投票が成立したとき)
  - 評価対象: `vote_total[*]`, `vote_unique[*]`, `vote_devotion[投票先キャラのみ]`, `vote_unique_all_biccame`

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
- グリッドが約 70 マスになるので、店舗カテゴリは**エリアごとにサブセクション分割** (関東 / 中部 / 関西 / 九州 / 北海道)

## 認証/認可

- `GET /api/users/me/badges` は要 Firebase Auth (既存の middleware を流用)
- `GET /api/badges/leaderboard` は public (将来非表示ユーザー対応はカラム追加で)
- `GET /api/badges` は public + 長期 cache

## Tasks

### Backend

- [ ] Prisma スキーマに `Badge` / `UserBadge` 追加 + マイグレーション (`prisma migrate diff`)
- [ ] `src/data/badges/store-exclusion.ts` で実店舗以外を列挙 + テストでスキーマと突き合わせ
- [ ] `src/data/badges/registry.ts` で全バッジ定義を生成
- [ ] `bun run badges:seed` スクリプト (upsert で Badge テーブル投入)
- [ ] `src/services/badge-evaluator.ts` で subCategory 別 evaluator 実装
- [ ] `src/services/badge-evaluator.ts` に `evaluateOnVisit` / `evaluateOnEventComplete` / `evaluateOnVote` ヘルパー
- [ ] 既存の `PUT /api/users/me/stores/:storeKey` に評価フック追加 + 新規バッジ返却
- [ ] 既存の `PUT /api/users/me/events/:eventId` に評価フック追加 + 新規バッジ返却
- [ ] 既存の `POST /api/votes` (一括投票含む) に評価フック追加 + 新規バッジ返却
- [ ] `GET /api/badges`, `GET /api/users/me/badges`, `GET /api/badges/leaderboard` 実装
- [ ] `scripts/backfill-badges.ts` (全ユーザー一括判定)
- [ ] OpenAPI spec / Zod スキーマ整備

### Frontend

- [ ] `src/hooks/use-badges.ts` (`useSuspenseQuery` 2 つ束ねる)
- [ ] `src/hooks/use-badge-leaderboard.ts`
- [ ] `src/data/badges.mock.ts` を削除し、components/badges/ をフック経由で接続
- [ ] アイコンは `iconName` 文字列 → lucide コンポーネント参照のマッピング表 (`src/lib/badge-icons.ts`)
- [ ] 店舗カテゴリの**エリアサブセクション化** (3 列 × 多段でも視認性を保つ)
- [ ] 獲得時 toast (店舗訪問/イベント完了 mutation の onSuccess で分岐)
- [ ] ヘッダー nav に `/badges` 追加 (ログイン時のみ)

### QA

- [ ] Evaluator のユニットテスト (各 subCategory ごとに境界値)
- [ ] バックフィル冪等性のテスト
- [ ] リーダーボードの順位計算 (タイブレーク含む) のテスト
- [ ] e2e: ログイン → 店舗訪問 → 該当バッジが UI に出現
- [ ] biome / tsc / playwright 全パス

## 設計原則 (バッジ全体)

- **ストリーク・連続日数を要求しない** ("連続 X 日" の発想は採らない)。アプリの温度感「パッと入力、たまに見返す」(memory `feedback_app_philosophy.md`) と矛盾するため
- 全バッジは**累計・多様性・愛着**のいずれかの軸で「ちまちまやれば自然に届く」ように設計
- レアリティの上限は「ヘビーユーザーなら数ヶ月で届く」程度に。**コンプを目標にしないでも遊べる**ことを優先
- ラベル・名称はポジティブ語のみ (memory `feedback_positive_naming.md`)

## 未確定事項 (実装中に詰める)

- 店舗マスタ (`stores.yaml` 等) のうち実店舗判定の根拠 → `prefecture` 必須でよいか
- 全店制覇とマイルストーン 50 (実店舗数次第) が同等になる可能性 → 「全店制覇」だけ legendary、50 マイルストーンは epic で別バッジ扱いに
- 投票系の「みんなに一票 (一括ボタン経由)」を残すか、「全員推し (累計でも OK)」に統合するか → 投票ログに `via_bulk` 列が必要なら統合推奨
- アイコン採用方針: lucide で全 ~86 個分けるか、店舗系は地図ピン共通で OK か
- リーダーボードの匿名表示オプト (Phase 2)

## ステップ実装順

1. Prisma 拡張 + registry.ts でバッジ定義 (Frontend のフックは mock 維持)
2. 評価ロジック + シード + バックフィル
3. API 3 本 + フロント接続
4. UI 仕上げ (toast / nav / エリアサブセクション)
