# 修正計画書 #3: Firebase Auth が PWA キャッシュにより 404 になる問題

## 問題の概要

PWA でキャッシュされている状態で Firebase Auth を利用したログイン（OAuth リダイレクト）が 404 になる。キャッシュ前（初回アクセス時）は正しくリクエストが飛び、ログインできる。

## 根本原因の分析

### 原因1: navigateFallback が /__/auth/* を横取りしている（主原因）

`vite.config.ts` の Workbox 設定:

```typescript
workbox: {
  navigateFallback: '/index.html',
  // navigateFallbackAllowlist が未設定！
}
```

`navigateFallback` が設定されているが `navigateFallbackAllowlist`（または `navigateFallbackDenylist`）が**未設定**。これにより、**すべてのナビゲーションリクエスト**（ブラウザの URL バーに入力した場合やリダイレクト）に対して `/index.html` が返される。

Firebase OAuth のフローでは:
1. ユーザーがログインボタンを押す
2. Firebase SDK が `signInWithRedirect()` で認証プロバイダーへリダイレクト
3. 認証後、Firebase が `/__/auth/handler` にコールバックリダイレクト
4. **ここで SW の `navigateFallback` が発動し、`/index.html` を返す**
5. `/__/auth/handler` の JavaScript/HTML が読み込まれず、認証処理が完了しない → 404 相当の動作

### 原因2: runtimeCaching の /__/auth/* パターンの正規表現エラー

```typescript
{
  urlPattern: /\/__\auth\/.*/i,  // ← 問題あり
  handler: 'NetworkFirst',
}
```

`\/__\auth\/` の `\a` は正規表現上 `a` と同じ（`\a` はエスケープシーケンスとして無効で `a` にフォールバック）ため、マッチ自体は成立する可能性がある。しかし `__` の前後のバックスラッシュ使用が不統一で、意図と異なるパスにマッチするリスクがある。

正しくは:

```typescript
urlPattern: /\/__\/auth\/.*/i,
```

### 原因3: navigateFallback と runtimeCaching の優先順位

Workbox では **NavigationRoute（navigateFallback）が runtimeCaching より先に評価される**。そのため、`/__/auth/*` に対する `NetworkFirst` ルールが runtimeCaching に設定されていても、ナビゲーションリクエストの場合は `navigateFallback` が先に `/index.html` を返してしまう。

runtimeCaching の `NetworkFirst` が機能するのは、**サブリソースリクエスト**（fetch API、XMLHttpRequest、<script> タグ等）の場合のみ。ブラウザのアドレスバーからの遷移やリダイレクトは「ナビゲーションリクエスト」として扱われるため、runtimeCaching をバイパスする。

### 再現フロー

```
[初回アクセス（SW 未登録）]
ログインボタン → OAuth プロバイダー → /__/auth/handler → Worker が処理 → ログイン成功

[2回目以降（SW 登録済み）]
ログインボタン → OAuth プロバイダー → /__/auth/handler
→ SW が NavigationRoute で /index.html を返す → Firebase handler が実行されない → 404
```

---

## 対応方法の比較

### 方法A: navigateFallbackDenylist に /__/auth を追加（推奨）

SW の `navigateFallback` から Firebase Auth のパスを除外する。

**変更箇所:** `vite.config.ts`

```typescript
workbox: {
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [
    /^\/__\/auth\//,   // Firebase Auth パスを除外
    /^\/api\//,        // API パスも除外（安全のため）
  ],
}
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約5分 |
| 金額コスト | $0 |
| リスク | 極めて低。除外リストを追加するだけ |
| 効果 | /__/auth/* へのナビゲーションが SW を通過し、Worker に到達する |

### 方法B: navigateFallbackAllowlist で SPA ルートのみに限定

`navigateFallback` をアプリのルートのみに限定する。

```typescript
workbox: {
  navigateFallback: '/index.html',
  navigateFallbackAllowlist: [
    /^\/$/,           // ルート
    /^\/characters/,  // キャラクターページ
    /^\/calendar/,    // カレンダーページ
    /^\/location/,    // 店舗マップ
    /^\/about/,       // アバウト
    /^\/contact/,     // お問い合わせ
    /^\/ranking/,     // ランキング
    /^\/login/,       // ログイン
    /^\/admin/,       // 管理画面
  ],
}
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約10分 |
| 金額コスト | $0 |
| リスク | 中。新しいルートを追加するたびにリストの更新が必要。更新漏れでルートが 404 になるリスク |
| 効果 | 明示的に許可したパスのみ SPA フォールバックが適用される |

### 方法C: navigateFallback を削除し、Cloudflare 側の SPA 対応に任せる

Workbox の `navigateFallback` を削除し、Cloudflare Workers の `not_found_handling = "single-page-application"` にフォールバック処理を委ねる。

`wrangler.toml` にて既に設定済み:
```toml
[env.prod.assets]
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/__/auth/*"]
```

Cloudflare 側では `run_worker_first` で `/__/auth/*` が Worker に優先ルーティングされるため、SPA フォールバックとの競合が起きない。

```typescript
workbox: {
  // navigateFallback を削除
  // Cloudflare の not_found_handling = "single-page-application" に委ねる
}
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約5分 |
| 金額コスト | $0 |
| リスク | 中～高。オフライン時に SPA ナビゲーションが動作しなくなる可能性。Cloudflare 側のフォールバックはネットワーク到達時のみ機能 |
| 効果 | SW レイヤーでのナビゲーション干渉を完全に排除 |

---

## 推奨対応

**方法A（navigateFallbackDenylist）** を推奨する。

理由:
- 最小限の変更で問題を解決できる
- オフライン時の SPA ナビゲーションを維持できる
- 新しいルート追加時のメンテナンスが不要
- Denylist 方式のため、問題のあるパスだけをピンポイントで除外できる

加えて、**runtimeCaching の正規表現も修正する**:

```typescript
// Before (バグあり)
urlPattern: /\/__\auth\/.*/i,

// After (修正済み)
urlPattern: /^\/__\/auth\/.*/i,
```

**合計実装コスト: 約10分、金額コスト: $0**

## 実装手順

1. `vite.config.ts` に `navigateFallbackDenylist` を追加
   ```typescript
   navigateFallbackDenylist: [/^\/__\//, /^\/api\//]
   ```
2. runtimeCaching の `/__/auth/*` 正規表現を修正
   ```typescript
   urlPattern: /^\/__\/auth\/.*/i,
   ```
3. ビルド & 動作確認
4. Firebase OAuth ログインのテスト（SW 登録済み状態で）

## 補足: 既存ユーザーの対応

この修正をデプロイしても、**既存ユーザーの SW は古い `navigateFallback` 設定のまま**。修正計画書 #2 の SW 自動更新機構が有効になることで、既存ユーザーにも新しい SW が配信され、問題が解消される。

そのため、**本修正は修正計画書 #2 と同時にデプロイすること**を推奨する。
