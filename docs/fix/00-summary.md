# PWA キャッシュ問題 修正計画サマリ

## 問題一覧と対応計画

| # | 問題 | 根本原因 | 推奨対応 | 計画書 |
|---|------|----------|----------|--------|
| 1 | characters.json が古いまま | React Query offlineFirst + precache 対象外 + runtimeCaching 対象外 | precache に json 追加 + runtimeCaching に StaleWhileRevalidate 追加 | [01-characters-json-cache.md](01-characters-json-cache.md) |
| 2 | ユーザーが能動的に更新できない | onNeedRefresh が console.log のみ | トースト通知 + 自動リロード | [02-sw-update-and-auto-reload.md](02-sw-update-and-auto-reload.md) |
| 3 | デプロイ後に自動更新されない | SW 更新後にページリロードが未実装 | controllerchange で自動リロード + 定期更新チェック | [02-sw-update-and-auto-reload.md](02-sw-update-and-auto-reload.md) |
| 4 | Firebase Auth ログインが 404 | navigateFallback が /__/auth/* を横取り + navigateFallbackDenylist 未設定 | navigateFallbackDenylist に除外パス追加 + 正規表現修正 | [03-firebase-auth-404.md](03-firebase-auth-404.md) |

## コスト見積もり

| 項目 | 実装時間 | 金額コスト |
|------|----------|------------|
| #1 characters.json キャッシュ | 約20分 | $0 |
| #2 + #3 SW 更新・自動リロード | 約20分 | $0 |
| #4 Firebase Auth 404 | 約10分 | $0 |
| テスト・検証 | 約30分 | $0 |
| **合計** | **約1時間20分** | **$0** |

全ての修正は設定変更とクライアントサイド JS の修正のみで完結し、追加のインフラコストやライブラリ導入は不要。

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `vite.config.ts` | globPatterns に json 追加、runtimeCaching にルール追加、navigateFallbackDenylist 追加、正規表現修正 |
| `src/app/main.tsx` | registerSW コールバック修正（トースト通知 + 自動リロード + 定期チェック） |

## 推奨デプロイ順序

全ての修正を **1回のデプロイで同時にリリース** することを推奨する。

理由:
- #4 の修正は #2 の SW 自動更新が機能しないと既存ユーザーに反映されない
- #1 の修正も同様に新しい SW が配信されて初めて有効になる
- 分割デプロイのメリットがなく、同時デプロイの方がシンプル

## デプロイ後の確認事項

1. **characters.json**: DevTools の Network タブで `StaleWhileRevalidate` が適用されていることを確認
2. **SW 更新**: Application タブで新しい SW が登録され、controllerchange が発火することを確認
3. **Firebase Auth**: OAuth ログインフロー（Twitter/Google/GitHub/Apple）が SW 登録済み状態で成功することを確認
4. **オフライン**: DevTools のオフラインモードで基本的なページナビゲーションが動作することを確認
