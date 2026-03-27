# 修正計画書 #1: characters.json キャッシュが更新されない問題

## 問題の概要

PWA を利用しているが、バージョンを更新しても `public/characters.json` が古いキャッシュのまま参照され続ける。

## 根本原因の分析

### 原因1: React Query の offlineFirst + LocalStorage 永続化

`src/app/main.tsx` にて以下の設定が適用されている:

```typescript
// QueryClient
networkMode: 'offlineFirst'    // キャッシュがあればネットワーク不要
staleTime: 1000 * 60 * 5       // 5分間はデータを「新鮮」とみなす
gcTime: 1000 * 60 * 60 * 24    // 24時間キャッシュ保持
refetchOnMount: false           // マウント時に再取得しない
refetchOnReconnect: false       // 再接続時に再取得しない
refetchOnWindowFocus: false     // フォーカス時に再取得しない

// Persister
maxAge: 1000 * 60 * 60 * 24 * 7  // 7日間 LocalStorage に保持
```

これにより、一度 `characters.json` を取得すると **最大7日間** LocalStorage のキャッシュが使い続けられる。`offlineFirst` により、ネットワークが利用可能であっても **キャッシュが優先** される。

### 原因2: バージョンチェックのタイミング問題

`checkVersionAndClearCache()` はバージョン変更時に React Query キャッシュをクリアするが、**新しい Service Worker が適用されるまで `__APP_VERSION__` と `__GIT_HASH__` は古いバンドルの値のまま**であるため、タイミングによってはバージョンチェックが機能しない。

### 原因3: Service Worker の precache に JSON が含まれていない

```typescript
globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}']
```

`json` が含まれていないため、`characters.json` はプリキャッシュ対象外。プリキャッシュされていればSW更新時にリビジョン管理されて自動的に更新されるが、現状ではその恩恵を受けられない。

また、`characters.json` は `/api/*` パターン（`/\/api\/.*/i`）にもマッチしないため、Runtime Caching のルールも適用されない。結果としてブラウザのデフォルトキャッシュ動作に依存し、React Query の offlineFirst と合わせて古いデータが残り続ける。

---

## 対応方法の比較

### 方法A: characters.json を Workbox の runtimeCaching に追加（推奨）

`vite.config.ts` の `runtimeCaching` に `characters.json` 専用のルールを追加し、`NetworkFirst` or `StaleWhileRevalidate` 戦略でキャッシュする。

**変更箇所:**
- `vite.config.ts`: runtimeCaching にルール追加

```typescript
{
  urlPattern: /\/characters\.json$/i,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'characters-json-cache',
    expiration: {
      maxEntries: 1,
      maxAgeSeconds: 60 * 60 * 24  // 1日
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**加えて React Query 側の設定を調整:**
- `staleTime` を短くする、または `characters` クエリのみ `refetchOnMount: true` に変更

| 項目 | 内容 |
|------|------|
| 実装コスト | 約15分 |
| 金額コスト | $0（設定変更のみ） |
| リスク | 低。既存キャッシュ戦略への追加のみ |
| 効果 | characters.json がネットワーク優先で取得されるようになる |

### 方法B: characters.json を precache 対象に追加

`globPatterns` に `json` を追加し、ビルド時のリビジョンハッシュで管理する。

```typescript
globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,json}']
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約5分 |
| 金額コスト | $0（設定変更のみ） |
| リスク | 中。`dist/client` 配下の全 JSON が precache に含まれるため、不要なファイルがキャッシュされる可能性。ただし `characters.json` 以外に大きな JSON はないため実質的な問題は小さい |
| 効果 | SW 更新時にリビジョンが変わり、新しい characters.json が自動取得される |

### 方法C: React Query の networkMode を変更

`offlineFirst` → `online` に変更し、常にネットワークリクエストを優先する。

| 項目 | 内容 |
|------|------|
| 実装コスト | 約5分 |
| 金額コスト | $0（設定変更のみ） |
| リスク | 高。オフライン対応が弱くなり、PWA としての UX が低下 |
| 効果 | キャッシュよりもネットワークが優先されるようになる |

---

## 推奨対応

**方法A + 方法B の組み合わせ** を推奨する。

1. `globPatterns` に `json` を追加して precache 対象にする（方法B）
2. `runtimeCaching` に `StaleWhileRevalidate` ルールを追加してランタイムでも適切に管理する（方法A）
3. `characters` クエリの `staleTime` を調整し、マウント時にバックグラウンドで再取得させる

これにより:
- SW 更新時に precache リビジョンで characters.json が更新される
- ランタイムでもネットワーク経由で最新データを取得できる
- オフライン時はキャッシュから即座にデータを返せる

**合計実装コスト: 約20分、金額コスト: $0**

## 実装手順

1. `vite.config.ts` の `globPatterns` に `json` を追加
2. `vite.config.ts` の `runtimeCaching` に characters.json 用ルールを追加
3. `src/hooks/use-characters.ts` の staleTime / refetch 設定を調整（必要に応じて）
4. ビルド & 動作確認
