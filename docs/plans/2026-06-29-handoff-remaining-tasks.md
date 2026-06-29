# リファクタリング完了後の残課題引き継ぎ (2026-06-29)

> 2026-06-29 のリファクタリングセッション (PR #56〜#77) で `docs/plans/2026-06-29-codebase-refactor-audit.md` の指摘項目はすべて対応完了。 本ドキュメントは **その後の "Phase 2"** として残されたタスクを、 別セッション (context をクリアした状態) からも着手できるよう自己完結した形でまとめたもの。

セッションをクリアしたあとに「残課題やろう」と user が言ったら、 まず本ドキュメントを読むこと。 関連 memory: `[[project_biccame_phase2]]`。

---

## 残課題一覧 (優先度順)

### 1. CSP Report-Only → Enforce 切替 (P3-1 follow-up)

**前提:**
- PR #76 (`f7ed9e2`) で `src/index.ts` に `contentSecurityPolicyReportOnly` を投入済み。
- 本番デプロイ後、 1〜2 週間ブラウザ DevTools の Console + (将来) Cloudflare の Report URI で違反を観測する想定。

**着手判断条件:**
- 違反レポートが空 (または無視できる軽微なもの) であることを確認。
- 観測期間: 最短 7 日、 推奨 14 日 (UI 全画面を一度は踏むため)。

**作業内容:**
1. `src/index.ts` の `contentSecurityPolicyReportOnly: {...}` を `contentSecurityPolicy: {...}` にキー名変更 (1 行差分)。
2. 必要なら違反レポートで判明したオリジンを追加・削除。
3. `bun run build` で型 OK 確認。
4. PR を develop に出す。 base branch protection は CSP の挙動変更を伴うため、 staging で 1 ラウンド確認してから master へ。

**リスク:**
- 観測せず切り替えると Firebase Auth / Maps / Turnstile のどれかで本番障害の可能性。
- 特に `style-src 'unsafe-inline'` を tighten したい場合は nonce 化が必要 (別途設計)。

**作業見積:** 30 分 (観測期間除く)

---

### 2. 依存パッケージのバージョン bump

**前提:**
- 2026-06-29 時点の `package.json` で `lucide-react: 1.14.0`、 `axios: 1.16.0`。
- npm の最新は `lucide-react: 1.22.0`、 `axios: 1.18.1` (要再確認)。

**作業内容:**
1. `bun pm view lucide-react versions | tail -10` で最新確認
2. `bun pm view axios versions | tail -10` で最新確認
3. `bun add lucide-react@latest axios@latest`
4. CHANGELOG を読んで breaking change 有無を確認 (特に lucide-react のアイコン rename)。
5. `bun run build` / `bunx tsc -b` / `bun test __tests__/` で確認。
6. e2e で UI 動作も確認 (`bun run test:e2e` — Playwright 必要)。
7. PR タイトル: `chore(deps): bump lucide-react and axios`

**リスク低**: minor bump のみ、 breaking change の可能性は限定的。

**作業見積:** 1 時間 (動作確認込み)

---

### 3. `@radix-ui/react-*` 個別パッケージの削除 (10 個)

**前提:**
- knip 検出済み: `@radix-ui/react-avatar` `react-checkbox` `react-dialog` `react-label` `react-select` `react-separator` `react-slot` `react-tabs` `react-toggle` `react-tooltip` の 10 個。
- 実際のコードは `radix-ui` (meta package) 経由で使っているため、 個別パッケージは「実際は import されていない」。
- ただし `radix-ui` が個別パッケージを peer dependency として要求している可能性あり (要検証)。

**検証手順:**
1. `bun pm view radix-ui dependencies` を実行。 出力に `@radix-ui/react-*` 系が並んでいたら、 meta package が **自前で require している** → 個別 package.json エントリを消しても引き続き動作する (実質的な重複だった)。
2. `bun pm view radix-ui peerDependencies` を実行。 こちらに並んでいる場合は **個別パッケージを別途インストールする必要がある** → 削除すると壊れる。
3. 検証結果が `dependencies` 側だったら削除に進む。

**作業内容 (削除可と判明後):**
1. `package.json` から 10 行削除。
2. `bun install` で lockfile 更新。
3. `bun run build` / `bunx tsc -b` / `bun test` で確認。
4. **必ず** Playwright e2e で実際の UI を踏んで Radix コンポーネント (Dialog / Select / Tooltip / Tabs / Checkbox など) が動くことを確認。
5. PR タイトル: `chore(deps): drop redundant @radix-ui/react-* individual packages`

**リスク中**: 検証ステップを飛ばすと本番で UI が壊れる。

**作業見積:** 1〜2 時間

---

### 4. Durable Object 全面移行 (StatsDO / VoteCounterDO / UserPushDO)

**前提:**
- 設計書 2 本あり (2026-06-29 投入済み):
  - `docs/plans/2026-06-29-do-counters-and-vote-perf.md` — StatsDO + VoteCounterDO の設計、 コスト試算、 投入順序
  - `docs/plans/2026-06-29-ws-push-notifications.md` — UserPushDO + WebSocket Hibernation の設計
- バッジ評価 `waitUntil` 化 (PR #57) と `setTimeout` 再取得は本タスクの "短期対応" として既に投入済み。

**全体の意義:**
- KV PAGE_VIEWS の atomic counter 不在 + eventually consistent な競合バグの解消
- 投票エンドポイントのレイテンシ短縮 (800ms → 50ms 目算)
- バッジ獲得 toast のリアルタイム push 復活 (現状は 2.5 秒遅延 invalidate)
- コスト: 試算上は KV から DO への移行で月額 ~$42 削減 (PV 10万/日想定)

**推奨投入順序:**
1. **`StatsDO`** から (リスク最小、KV からの dual-write で安全に移行可能)
2. **`UserPushDO` + WebSocket クライアント実装** (バッジ toast のリアルタイム化)
3. **`VoteCounterDO`** (最も影響大、 投票の信頼性が DO に依存するため要慎重)

**実装スコープが大きいため、 各 DO で 1 PR ずつ分けて投入推奨。** wrangler.toml の `[[migrations]]` 設定は cumulative なので順次追加。

**作業見積:** 各 DO で 1〜2 日 (設計確定済み、実装と動作確認のみ)

---

## 順序とトリガー

```
[今すぐ可]                  [運用観測 1〜2 週間後]      [大型 / 別タイミング]
依存 bump                  CSP Enforce 切替           Durable Object 移行
@radix-ui 個別削除                                    (StatsDO → UserPushDO → VoteCounterDO)
```

- **今すぐやれる**: 2 (依存 bump)、 3 (radix 削除)
- **観測期間後**: 1 (CSP Enforce)
- **別タイミング (要工数確保)**: 4 (DO 移行)

---

## 再着手時のチェックリスト

セッションをクリアした user が「残課題やろう」と言った場合、 Claude は以下を確認してから着手すること:

1. ✅ 本ドキュメント (`docs/plans/2026-06-29-handoff-remaining-tasks.md`) を読む
2. ✅ memory `project_biccame_phase2.md` を参照
3. ✅ `git log --oneline -30` で前回のリファクタが develop に着地済みか確認
4. ✅ `bunx knip --no-progress` を再走して 2026-06-29 当時から状況が変わってないか確認
5. ✅ 本番デプロイ後の経過日数を user に聞く (CSP Enforce 判断のため)
6. ✅ どの残課題から着手するか user に確認 (順序が任意であることを伝える)

---

## 関連リファクタリング履歴 (2026-06-29 セッション)

PR ベースで合計 22 本マージ:

| 種別 | PR | 内容 |
|---|---|---|
| docs | #56 | 計画書 3 本投入 |
| perf | #57 | バッジ評価 waitUntil 化 |
| refactor | #58 | admin-badge スキーマ集約 |
| refactor | #59 | badge-evaluator switch → table |
| refactor | #60 | event-service create/update 重複削除 |
| chore | #66 | knip 整理 (未使用 export/type 24 件削除) |
| refactor | #62 | JWT zod 検証 |
| refactor | #64 | admin-* サブグループ化 |
| refactor | #65 | conditionMeta zod 検証 |
| refactor | #67 | admin/badges 分割 (907→130 行) |
| refactor | #68 | client.ts 14 ドメインファイル分割 |
| refactor | #69 | event-detail-header 4 ファイル分割 |
| refactor | #70 | event-form: 店舗 + Flag 抽出 |
| refactor | #71 | event-list 3 ファイル分割 |
| refactor | #72 | ranking-list 5 ファイル分割 |
| refactor | #73 | login-dialog 3 ファイル分割 |
| test | #74 | critical path テスト網羅 (+16 件) |
| perf | #75 | PWA SW 登録の requestIdleCallback 化 |
| security | #76 | CSP Report-Only 導入 |
| perf | #77 | event-service Prisma select 化 |

すべて squash merge 済み。
