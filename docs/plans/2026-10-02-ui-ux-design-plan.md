# UI UX と設計の改善 Implementation Plan

GitHub管理課題: [#58](https://github.com/qtmleap/biccame-musume/issues/58)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 認証・投票・経路の信頼性を先に修正し、主要画面の状態整合性、アクセシビリティ、探索・共有導線を改善する。

**Architecture:** 既存のReact、TanStack Query/Router、Jotai、Hono/Zod、Firebase、Cloudflare Workers/D1/DOを維持する。認証・ユーザーquery key・JST日付・経路応答の契約を共通化し、24件を独立してレビューできるPRへ分割する。外部投稿とユーザー状態の副作用を通常データの成功/失敗と区別する。

**Tech Stack:** Bun / TypeScript / React / TanStack Query / TanStack Router / Jotai / Hono / Zod / Firebase / Cloudflare Workers / Prisma D1 / Playwright。

**Spec:** [改善課題一覧](./2026-10-02-ui-ux-design-issues.md)

## Global Constraints

- アプリは日本語の既存UIを維持し、失敗・参考情報・未登録状態を利用者へ正確に説明する。
- 課題の修正は独立したPRに分け、developへ送る。develop/masterへ直接コミットしない。
- index.cssおよびsrc/components/ui/**/*.tsxは直接編集しない。
- 現行依存関係を優先し、本計画のためだけにUIフレームワークを追加しない。
- 本作業は課題と計画の作成まで。修正実装・デプロイ・告知投稿は開始しない。

既存のCLAUDE.md、README.md、課題一覧の共通要件も各タスクに適用する。実施時は現在のコードと課題を再読し、調査時点の行番号に依存しない。

## Review Focus

1. アカウント変更直後に以前のキャッシュや認証応答が到着しても、新ユーザーの状態に反映されないこと（A01/A02）。
2. リクエスト開始後の全クリア・駅変更・画面離脱で旧結果が復活せず、取得失敗を0分として表示しないこと（A05/A06）。
3. UTC端末、JST午前0時、元日、処理中の年跨ぎでも投票・イベント・補償処理の基準日が一致すること（A07）。
4. 不明ID、データソース障害、巨大入力、外部API障害を区別し、拒否後にDB/DO/AIの副作用が起きないこと（A03/A04/A08）。
5. 375pxで閉じた操作群がTab対象に残らず、メニューを閉じた後にフォーカスが戻り、1280pxの操作も失われないこと（A10）。

## 実施順とPR分割

| フェーズ | 目的 | タスク | 並行化と依存 |
|---|---|---|---|
| 1 | 認証・投票・資源消費の保護 | A01 → A02、A03、A04 | A01/A03/A04は別領域で並行可。A02はA01のキー・認証境界に合わせる |
| 2 | 正確な結果と日付・一覧状態 | A05 → A06、A07 → A09、A08 | A05はA04後、A07はA03後。A08は独立 |
| 3 | 操作性と運用整合性 | A10、A11、A12、A13 | A11はA07後。A10はイベント一覧・経路の変更と編集競合するため順序を調整 |
| 4 | 探索・共有導線と総合検証 | A14 → A15 | A14はA08/A10後。A15の検証は各PRでも実施し、最後に全体確認 |

1タスクを原則1PRにする。期限・担当者・見積日数は設定せず、依存関係と完了条件で進捗を管理する。新しい依存や大きな仕様変更が判明した場合は先に課題と計画を更新する。

## ファイル責務

| 新設候補 | 責務 | 所有タスク |
|---|---|---|
| src/lib/user-query-keys.ts | UID別query keyの生成 | A01 |
| src/lib/auth-session.ts | バックエンドセッション確立と再試行の共通呼出し | A02 |
| src/utils/jst-date.ts | 明示的な時刻を受け取るJST日付計算 | A07 |
| src/hooks/use-jst-date.ts | 日付境界・画面復帰による日付state更新 | A07 |
| src/utils/event-status.ts | UI/API共通のイベント状態算出 | A07 |

既存ファイルの変更対象は各タスクに記載。新規テストのパスは作成予定であり、現在存在することを意味しない。

## Task A01: ログアウト時のセッション失効とユーザー別キャッシュ分離

**優先度:** P1 / **GitHub:** [#43](https://github.com/qtmleap/biccame-musume/issues/43) / **依存:** なし

**Files:**
- Modify: `src/api/auth.ts`
- Modify: `src/utils/client.ts`
- Modify: `src/hooks/use-auth.ts`
- Modify: `src/components/auth/auth-provider.tsx`
- Modify: `src/hooks/use-favorites.ts`
- Modify: `src/hooks/use-user-activity.ts`
- Modify: `src/hooks/use-badges.ts`
- Modify: `src/hooks/use-push-stream.ts`
- Modify: `src/app/main.tsx`
- Create: `src/lib/user-query-keys.ts`
- Test: `__tests__/api/auth-logout.test.ts`
- Test: `e2e/auth-session.spec.ts`

**Interfaces and decisions:**

POST /api/auth/logout を追加し、session Cookieをpath=/で失効。成功後にFirebase signOut、ユーザーキャッシュ削除、画面遷移。失効失敗時はログアウト完了扱いにしない。src/lib/user-query-keys.ts を新設し userQueryKeys.favorites(uid)、activities(uid)、badges(uid) を ['user',uid,resource] に統一。ユーザークエリはmeta.persist=falseにし、旧 ['me',...] と ['user_activities'] の保存データも復元前に除去。Push通知とmutationのinvalidateも同じキーを使用。

**Regression tests:**

- `logout_then_protected_api_returns_401`: ログアウト後のCookie jarで認証必須APIが401
- `account_switch_does_not_restore_previous_user_data`: A→ログアウト→BでAの推し・活動・獲得バッジが表示されない
- `logout_failure_keeps_retry_available`: 失効失敗時に完了表示へ進まず再試行できる

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/api/auth-logout.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/auth-session.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/auth-session-and-user-cache` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A02: 認証失敗からの復帰と未ログインのマイページ遷移を修正

**優先度:** P1 / **GitHub:** [#44](https://github.com/qtmleap/biccame-musume/issues/44) / **依存:** A01

**Files:**
- Modify: `src/atoms/auth-atom.ts`
- Modify: `src/components/auth/auth-provider.tsx`
- Modify: `src/components/auth/backend-session-gate.tsx`
- Modify: `src/hooks/use-auth.ts`
- Modify: `src/app/routes/me/index.tsx`
- Create: `src/lib/auth-session.ts`
- Test: `__tests__/auth/session-state.test.ts`
- Test: `e2e/auth-recovery.spec.ts`

**Interfaces and decisions:**

BackendSessionState を {status:'idle'|'pending'} | {status:'ready';uid:string} | {status:'error';message:string} と定義。backendSessionReadyはreadyから導出し二重管理を避ける。src/lib/auth-session.ts のestablishBackendSession():Promise<void> をproviderと再試行から利用。Firebase UIDが変わればpendingに戻し、古いUIDの遅い応答を採用しない。全保護ルートのbeforeLoadを監査し、非同期認証確認のresolve/rejectとredirectを保証する。

**Regression tests:**

- `anonymous_me_redirects_without_pending_navigation`: 匿名 /me はホームへ遷移
- `backend_auth_failure_shows_retry`: /api/authの500でエラーと再試行ボタン
- `stale_auth_response_is_ignored`: Aの認証応答がBのready状態を作らない

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/auth/session-state.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/auth-recovery.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/auth-recovery` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A03: 投票対象IDの検証と信頼できるレート制限キー

**優先度:** P1 / **GitHub:** [#45](https://github.com/qtmleap/biccame-musume/issues/45) / **依存:** なし

**Files:**
- Modify: `src/api/vote.ts`
- Modify: `src/schemas/vote.dto.ts`
- Modify: `src/services/vote-service.ts`
- Modify: `src/utils/character-whitelist.ts`
- Modify: `src/middleware/ip-check.ts`
- Test: `__tests__/api/vote-validation.test.ts`
- Test: `e2e/vote-limit.spec.ts`

**Interfaces and decisions:**

既存loadBiccameMusumeIdSetで単発・一括の全IDをclaim前に検証。不明IDを含むリクエストは400で全体拒否し、DO/DBに触れない。whitelist読込失敗は正常な空集合と区別して503。ipCheck後に検証済みCLIENT_IPを制限キー vote:<ip> に使い、Authorization文字列をキーにしない。既存50件/60秒の設定を維持する。

**Regression tests:**

- `unknown_vote_id_has_no_side_effects`: 不明IDで400かつclaim/DB呼出し0
- `mixed_bulk_vote_is_rejected_before_claim`: 実在と架空の混在でも保存0
- `authorization_changes_do_not_change_limit_bucket`: 異なるヘッダーでも同IPは同枠
- `whitelist_failure_returns_503`: データ取得失敗を不明ID400にしない

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/api/vote-validation.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/vote-limit.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/vote-input-and-rate-limit` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A04: 経路生成APIの入力サイズとAI使用量を制限

**優先度:** P1 / **GitHub:** [#46](https://github.com/qtmleap/biccame-musume/issues/46) / **依存:** なし

**Files:**
- Modify: `src/api/direction.ts`
- Modify: `src/schemas/route.dto.ts`
- Modify: `src/types/bindings.ts`
- Modify: `wrangler.toml`
- Modify: `src/middleware/ip-check.ts`
- Test: `__tests__/api/directions-limits.test.ts`

**Interfaces and decisions:**

提案値として駅名・店舗名を各100文字、bodyを8KiB、既存区間数上限5件に制限。DIRECTIONS_RATE_LIMITERをlocal/staging/productionへ追加しIPごと10件/60秒。超過は429、サイズ超過は413。検証と制限はai.run前。正常応答のみ正規化した経路キーで10分キャッシュし、degradedは保存しない。閾値はstaging計測後に調整可能な設定として扱う。

**Regression tests:**

- `oversized_input_never_calls_ai`: 101文字/8KiB超過でAI呼出し0
- `rate_limit_denial_never_calls_ai`: 制限拒否で429かつAI呼出し0
- `identical_route_reuses_cache`: 同一経路は正常応答を再利用、失敗はキャッシュしない

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/api/directions-limits.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** 対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/directions-resource-limits` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A05: 経路結果の失敗状態・推測値・距離表示を正確にする

**優先度:** P1 / **GitHub:** [#47](https://github.com/qtmleap/biccame-musume/issues/47) / **依存:** A04

**Files:**
- Modify: `src/schemas/route.dto.ts`
- Modify: `src/api/direction.ts`
- Modify: `src/components/route/types.ts`
- Modify: `src/components/route/use-directions.ts`
- Modify: `src/components/route/route-result.tsx`
- Modify: `src/app/routes/route/index.tsx`
- Modify: `src/utils/tsp.ts`
- Test: `__tests__/api/directions-contract.test.ts`
- Test: `__tests__/utils/tsp.test.ts`
- Test: `e2e/route-result.spec.ts`

**Interfaces and decisions:**

RouteResponseSchemaをdiscriminated unionにし、成功 {status:'estimated';legs:LegResponse[]}、失敗 {status:'unavailable';reason:'generation_failed'} とする。空路線を正常値にせず、サーバー出力で要求区間との一致・件数・非負時間を検証。画面の失敗時コピーは「所要時間を取得できませんでした」。成功にも「AIによる参考経路」と外部経路検索への導線を表示。球面距離calcGreatCircleKm(a:Point,b:Point):numberを使い「店舗間の直線距離」「直線距離を基準にした訪問順」と表示、交通での最短を保証しない。

**Regression tests:**

- `failed_route_has_no_zero_minute_label`: 失敗結果に0分/概算表示がない
- `route_response_union_accepts_unavailable`: 失敗応答も宣言スキーマを通る
- `mismatched_ai_legs_are_unavailable`: 要求と違う駅・件数/負の時間を拒否
- `great_circle_distance_uses_longitude_scale`: 同緯度35度で経度1度差は約91kmで111kmにならない

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/api/directions-contract.test.ts __tests__/utils/tsp.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/route-result.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/route-result-contract` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A06: 経路探索中の入力変更で古い結果を表示しない

**優先度:** P2 / **GitHub:** [#48](https://github.com/qtmleap/biccame-musume/issues/48) / **依存:** A05

**Files:**
- Modify: `src/app/routes/route/index.tsx`
- Modify: `src/components/route/use-directions.ts`
- Test: `e2e/route-race.spec.ts`

**Interfaces and decisions:**

getDirections(route,signal?:AbortSignal)にキャンセルを追加。入力変更・全クリア・unmountでAbortControllerを中止しrequest generationを更新。最新世代だけがsetResult/isCalculatingを更新。AbortErrorは警告や失敗結果へ変換しない。

**Regression tests:**

- `clear_during_calculation_keeps_result_empty`: 全クリア後に遅い応答を返しても結果なし
- `station_change_discards_previous_response`: 駅変更前の応答は不採用
- `abort_does_not_show_failure_toast`: キャンセルで警告なし

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** 対象Playwrightテストを実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/route-race.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/route-request-race` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A07: 投票・イベントのJST日付更新と年末補償処理を統一

**優先度:** P2 / **GitHub:** [#49](https://github.com/qtmleap/biccame-musume/issues/49) / **依存:** A03

**Files:**
- Modify: `src/utils/vote.ts`
- Modify: `src/services/vote-service.ts`
- Modify: `src/services/event-service.ts`
- Modify: `src/components/characters/character-vote-button.tsx`
- Modify: `src/components/characters/bulk-vote-button.tsx`
- Modify: `src/app/routes/events/index.tsx`
- Create: `src/utils/jst-date.ts`
- Create: `src/hooks/use-jst-date.ts`
- Create: `src/utils/event-status.ts`
- Test: `__tests__/utils/jst-date.test.ts`
- Test: `__tests__/event-service/event-status.test.ts`
- Test: `__tests__/vote-service/vote-service.test.ts`
- Test: `e2e/date-boundary.spec.ts`

**Interfaces and decisions:**

src/utils/jst-date.ts にgetJstDateKey(now:string):string、getJstYear(now:string):number、getNextJstMidnight(now:string):stringを用意し既存vote utilを互換ラッパーにする。src/hooks/use-jst-date.ts がJST午前0時とvisibilitychangeで日付stateを更新。src/utils/event-status.ts のcalculateEventStatus(event,nowIso)をサーバーとUIで共有し、古いlast_dayによる上書きを廃止。投票開始時にVoteContext={dateKey,year,stub}を固定しclaim/DB/releaseへ渡す。

**Regression tests:**

- `utc_device_vote_unlocks_at_jst_midnight`: UTC端末でもJST境界でボタン解除
- `last_day_becomes_ended_after_midnight`: 翌日に終了フィルタへ移る
- `new_year_read_and_write_same_year`: 元日UTC15時境界で取得/保存年度一致
- `release_uses_original_context`: 年跨ぎのDB失敗でも元のDOとdateKeyを解放

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/utils/jst-date.test.ts __tests__/event-service/event-status.test.ts __tests__/vote-service/vote-service.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/date-boundary.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/jst-date-consistency` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A08: イベント取得エラー・ページ番号・統計取得上限を修正

**優先度:** P2 / **GitHub:** [#50](https://github.com/qtmleap/biccame-musume/issues/50) / **依存:** なし

**Files:**
- Modify: `src/hooks/use-events.ts`
- Modify: `src/components/events/paginated-event-grid.tsx`
- Modify: `src/app/routes/events/index.tsx`
- Modify: `src/app/routes/admin/events/new/index.tsx`
- Modify: `src/api/event.ts`
- Modify: `src/services/me-service.ts`
- Test: `__tests__/api/event-stats.test.ts`
- Test: `e2e/event-list-state.spec.ts`
- Test: `e2e/admin-event-copy-error.spec.ts`

**Interfaces and decisions:**

optional/detailのキャッシュ契約を分離しquery key ['events','optional',id] とする。404だけnull、500/通信失敗はthrow。PaginatedEventGridでeffectivePage=clamp(page,1,max(1,totalPages))を使って描画し、所有stateも補正。statsは重複除去後最大50ID、ID各100文字、超過400。クライアントは50件ずつ分割して取得する。空状態は「条件に一致するイベントはありません」と条件解除を表示。

**Regression tests:**

- `optional_event_500_does_not_return_null`: 500でerror、404でnull
- `shrinking_results_clamps_page`: 13件→12件で1ページを表示し13–12表記なし
- `stats_over_limit_is_rejected`: 51個の異なるIDで400、DB呼出し0
- `filtered_empty_state_offers_reset`: 0件で条件解除が使える

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/api/event-stats.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/event-list-state.spec.ts e2e/admin-event-copy-error.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/event-query-and-pagination` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A09: 次の誕生日までの日数で並び替える

**優先度:** P2 / **GitHub:** [#51](https://github.com/qtmleap/biccame-musume/issues/51) / **依存:** A07

**Files:**
- Modify: `src/utils/character.ts`
- Test: `__tests__/utils/character-birthday-sort.test.ts`

**Interfaces and decisions:**

getDaysFromBirthday(dateStr,nowIso?:string):numberをJST日付基準の次回までの非負日数にする。当日は0、今年過ぎたら翌年へ。2月29日は非うるう年に2月28日として扱う（計画上の方針）。不正/未設定はNumber.MAX_SAFE_INTEGERを維持。

**Regression tests:**

- `past_birthday_is_next_year`: 基準2026-10-02、10/1は364、10/3は1
- `birthday_today_is_zero`: 同日0
- `leap_day_policy_is_feb28`: 非うるう年2/28が0

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/utils/character-birthday-sort.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** 対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/upcoming-birthday-sort` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A10: 操作ラベル・選択状態・モバイルメニューのアクセシビリティ統一

**優先度:** P2 / **GitHub:** [#52](https://github.com/qtmleap/biccame-musume/issues/52) / **依存:** なし

**Files:**
- Modify: `src/components/common/header.tsx`
- Modify: `src/components/characters/region-filter-control.tsx`
- Modify: `src/components/characters/character-sort-control.tsx`
- Modify: `src/components/calendar/calendar-controls.tsx`
- Modify: `src/components/route/selected-store-list.tsx`
- Modify: `src/app/routes/events/index.tsx`
- Modify: `src/app/routes/__root.tsx`
- Test: `e2e/accessibility-controls.spec.ts`

**Interfaces and decisions:**

メニューは既存SheetでEscape・フォーカス復帰・背面制御を提供。操作名は「前の月」「次の月」「イベントを絞り込む」「一覧表示」「日程表示」「{店舗名}をルートから削除」「{店舗名}の利用駅」。単一地域選択はRadioGroup、月選択はaria-pressed。閉じた並び替えの操作はhidden/inertでフォーカスと読み上げ対象から除外し、デスクトップ表示を維持。select-noneは必要な装飾だけへ限定。uiディレクトリは編集しない。

**Regression tests:**

- `menu_escape_restores_focus`: Escape後にトリガーへ戻る
- `closed_sort_has_no_focusable_options`: 375px閉状態でTab対象に並び替え候補なし
- `controls_have_names_and_selected_state`: 操作名と地域/月の選択状態をroleで取得可能
- `desktop_sort_remains_visible`: 1280pxで候補を操作可能

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** 対象Playwrightテストを実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/accessibility-controls.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/accessibility-controls` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A11: 投票DOの不要なalarm予約を停止

**優先度:** P2 / **GitHub:** [#53](https://github.com/qtmleap/biccame-musume/issues/53) / **依存:** A07

**Files:**
- Modify: `src/durable-objects/vote-counter.ts`
- Modify: `src/services/vote-service.ts`
- Test: `__tests__/vote-service/vote-counter-alarm.test.ts`

**Interfaces and decisions:**

投票変更時に保存用alarmを予約し、flush後にdirty=falseなら短期alarmを停止。daily_votedのpruneはclaim時に日付変更を検知して実施。既存alarmを受けても再予約せず終了。snapshotとD1集計の復元・release時の変更も保存対象として確認。

**Regression tests:**

- `clean_alarm_is_not_rescheduled`: dirty=falseのalarmでsetAlarmなし
- `vote_schedules_single_flush`: 複数変更で保存予約を重複しない
- `restart_restores_snapshot`: flush後再起動でカウンタ復元
- `new_day_prunes_old_claims`: 日付変更claimで古い履歴を除去

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/vote-service/vote-counter-alarm.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** 対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/vote-counter-alarm` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A12: イベント再送時の告知重複を防止

**優先度:** P2 / **GitHub:** [#54](https://github.com/qtmleap/biccame-musume/issues/54) / **依存:** なし

**Files:**
- Modify: `src/services/event-service.ts`
- Modify: `src/api/event.ts`
- Modify: `src/utils/twitter.ts`
- Test: `__tests__/event-service/event-service.test.ts`
- Test: `__tests__/api/event-announcement.test.ts`

**Interfaces and decisions:**

createEventの戻り値を {event:EventDetail,created:boolean} にし利用箇所を更新。created=trueかつshouldTweet!==falseだけ告知。同時作成のunique競合は既存取得created=falseへ。外部投稿の再送までexactly-onceは保証しない。投稿失敗の自動再送/outboxは本課題の対象外とし別途要件がある場合に追加。

**Regression tests:**

- `same_uuid_posts_announcement_once`: 連続2POSTで告知呼出し1
- `concurrent_uuid_has_one_creator`: 同時競合で新規作成扱いは1件
- `tweet_failure_does_not_duplicate_event`: 告知失敗後の再送でもDB重複なし

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** `bun test __tests__/event-service/event-service.test.ts __tests__/api/event-announcement.test.ts`を実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** 対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/event-announcement-idempotency` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A13: 座標未登録の店舗を誤った場所に表示しない

**優先度:** P2 / **GitHub:** [#55](https://github.com/qtmleap/biccame-musume/issues/55) / **依存:** なし

**Files:**
- Modify: `src/app/routes/location/index.tsx`
- Modify: `src/components/store-list-item.tsx`
- Modify: `src/components/selected-store-info.tsx`
- Test: `e2e/location-missing-coordinate.spec.ts`

**Interfaces and decisions:**

地図マーカーは有限かつ範囲内のcoordinatesがある店舗だけ。座標なし店舗は一覧に残して「地図位置未登録」と表示、選択時に東京駅へパンしない。東京駅は地図の初期中心としてのみ利用可。

**Regression tests:**

- `missing_coordinate_has_no_marker`: 座標なし店舗にマーカーなし
- `missing_coordinate_remains_in_list`: 一覧と未登録説明を表示
- `select_missing_coordinate_does_not_pan`: 既存地図中心を変更しない

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** 対象Playwrightテストを実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/location-missing-coordinate.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`fix/map-missing-coordinates` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A14: 初訪問の導線とフィルター共有方針を整理

**優先度:** P3 / **GitHub:** [#56](https://github.com/qtmleap/biccame-musume/issues/56) / **依存:** A08, A10

**Files:**
- Modify: `src/components/home/home-header.tsx`
- Modify: `src/app/routes/events/index.tsx`
- Modify: `src/app/routes/characters/index.tsx`
- Modify: `src/atoms/filter-atom.ts`
- Modify: `src/atoms/event-page-atom.ts`
- Test: `e2e/navigation-filter-sharing.spec.ts`

**Interfaces and decisions:**

トップに「娘を探す」「イベントを探す」「店舗マップ」のリンクを追加。イベント検索条件category/status/region/store/pageをvalidateSearchのURLへ集約。画面幅による表示方式など個人設定だけlocalStorageへ。キャラ地域とイベント地域は独立させ、URL未指定の既定地域all。後方互換として?store=は維持。既存永続フィルターのURLなし初回への移行は行わず既定値を採用。

**Regression tests:**

- `shared_url_reproduces_filters`: 異なる保存設定のブラウザでも同URLで同条件
- `character_region_does_not_change_events`: キャラ側変更がイベントへ影響しない
- `home_primary_links_are_available`: 375/1280pxで3導線を操作可能

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** 対象Playwrightテストを実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/navigation-filter-sharing.spec.ts` と対象ユニットテストを再実行し、全assert成功を確認する。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`feat/navigation-and-filter-sharing` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## Task A15: UI回帰を検出する検証とstaging確認を整備

**優先度:** P2 / **GitHub:** [#57](https://github.com/qtmleap/biccame-musume/issues/57) / **依存:** A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, A13, A14

**Files:**
- Modify: `e2e/visual-check.spec.ts`
- Modify: `e2e/sticky-check.spec.ts`
- Modify: `e2e/routes.test.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/integration.yaml`
- Test: `e2e/visual-check.spec.ts`
- Test: `e2e/sticky-check.spec.ts`
- Test: `e2e/routes.test.ts`

**Interfaces and decisions:**

主要画面に見出し・エラー非表示・操作期待値のassertを追加。visualは固定時計/fixture/SW無効/animations無効でtoHaveScreenshotへ移行し、375pxと1280pxの基準画像をレビュー。CIにPlaywright用local DB migrate/fixture/auth emulatorの起動停止を組み込み、productionへアクセスしない。stagingでログアウトCookie、UTC/JST、地図欠損、キーボード、ライト/ダークのコントラストを実測し証跡を残す。

**Regression tests:**

- `visual_change_fails_instead_of_overwriting`: 意図的差分で失敗し基準画像を書換えない
- `route_200_with_error_screen_fails`: HTTP200でもエラー画面を成功扱いしない
- `sticky_header_position_is_asserted`: スクロール後の期待位置をassert

- [ ] **Step 1:** 上記のテスト名と期待値で失敗する回帰テストを作成する。API/DO/AIはstubを使い、投稿や本番データ変更は行わない。
- [ ] **Step 2:** 対象Playwrightテストを実行し、今回の問題に対応するassertで失敗することを確認する。環境起動エラーは再現確認としない。
- [ ] **Step 3:** 対応方針に従って対象ファイルを修正し、関連呼出し元の型・query key・応答契約を一致させる。
- [ ] **Step 4:** `bunx playwright test e2e/visual-check.spec.ts e2e/sticky-check.spec.ts e2e/routes.test.ts` と対象ユニットテストを再実行し、全assert成功を確認する。基準画像の更新は差分を人がレビューした場合だけ行う。
- [ ] **Step 5:** `bunx tsc --noEmit` と変更したsrc/テストファイルへの `bunx biome check <変更ファイル>` を実行し、終了コード0を確認する。
- [ ] **Step 6:** 対象ファイルだけを明示してコミットし、`test/ui-regression-and-staging-check` のPRをdevelopへ送る。今回の課題番号、期待動作、検証結果、残る制約をPR本文へ記載する。レビュー後に課題の完了条件を更新する。

## 検証環境と完了基準

- Unit: `bun test`。既存bunfig.tomlは./__tests__を対象にするため、Playwrightは別途実行する。
- E2E: `bunx playwright test`。既存playwright.config.tsは15300番で `bun run dev:e2e` を起動する。ローカルD1の `bun run migrate` とテスト用データ/認証環境を用意してから実行する。全体E2Eには管理・バッジなどのfixtureが必要であり、未用意なら成功と報告しない。
- 型・lint: `bunx tsc --noEmit`、`bunx biome check src __tests__`、変更したe2eファイルへの個別チェック。
- staging: 実際のCookie失効、UTC/JST日付境界、匿名遷移、375px/1280px、ライト/ダーク、Tab/Escape、地図欠損とAI失敗を確認する。アクセシビリティは色・読み上げの実測結果を記録する。
- 各課題のassertが成功し、関連回帰がないこととPRレビューをもって完了とする。HTTP200やスクリーンショット取得だけを成功基準にしない。
- 機能ごとの修正をstagingで確認してから段階的に反映する。デプロイ・本番設定変更・マージは計画作成の作業に含めない。

## 対象外と残る確認

D1の原子性、実環境Access設定、実データの座標欠損、外部APIの実負荷は未検証。コントラストは公開版の一部を実測したが、全画面・両テーマの網羅確認は未実施。確定していない問題の対策を実装せず、A15で確認し必要なら別課題にする。経路を実データの交通最短へ変える大規模連携、告知のoutboxによる自動再送は本計画に含めない。

## 自己レビュー

- [x] 前回・追加レビューの確定指摘と設計提案を24課題へ対応付けた。
- [x] 認証・キャッシュ・時刻・経路応答の共通契約と依存を定義した。
- [x] Review Focusの5条件を各所有タスクの回帰テストへ含めた。
- [x] 未検証事項と計画上の提案値を事実・外部制約と区別した。
- [x] 既存の開発規約とdocs/plansの保存先に合わせた。


## 追加実施フェーズ: 視覚とレスポンシブ改善

[追加視覚レビュー](2026-10-02-responsive-visual-review.md)に基づく。P1の認証・データ信頼性修正を優先し、このフェーズはP2/P3のUI改善として進める。アプリ実装はまだ開始しない。

1. B01で文字の基準を整え、A10と操作名・選択状態を合わせる。
2. B02/B03/B04で日程表・月選択・検索の主要導線を改善。B06はA13の座標欠損方針確定後に進める。
3. B08はA08/B02後に件数とフィルター完了操作を追加。B09はA05/A06の結果契約に合わせて初期説明を整える。
4. B05/B07で詳細とカードの視覚的な統一を進める。A14ではホーム導線とカウンター配置を改善。
5. A15で全24課題の回帰とstaging確認を統合。

### B01: 補足文字の読みやすさと狭い画面のタイトル省略を改善 ([#59](https://github.com/qtmleap/biccame-musume/issues/59))

依存: A10。ブランチ候補: `fix/visual-typography`。

日付・店舗の補足文字を13〜14px、本文は14〜16pxを基準として見直す。重要なリンクは背景に対するコントラスト4.5:1以上を設計目標とし、ブランドと既存テーマを維持。320/375pxではイベント名を最大2行にし、状態バッジがタイトル幅を過度に奪わない。すべての文字を一律に拡大せず優先情報に適用する。

対象: `src/themes/light.css`, `src/themes/dark.css`, `src/components/home/event-list-item.tsx`, `src/components/home/home-header.tsx`, `src/components/events/event-grid-item.tsx`, `src/components/calendar/calendar-event-list.tsx`, `src/components/characters/detail/store-info-items.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxで長いイベント名の重要部分が最大2行で読め、状態バッジと重ならない
- [ ] 768/1024/1280/1440pxで見出し・本文・補足の文字階層が保たれる
- [ ] 主要補足情報は13px以上、ピンク背景上の通常文字リンクは4.5:1以上を測定確認
- [ ] ライト/ダークの両方で読める。ダークは明示的なテーマ確認として扱う

検証候補: `e2e/visual-typography.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B02: イベント一覧の日程表を読みやすくしモバイルの初期表示を改善 ([#60](https://github.com/qtmleap/biccame-musume/issues/60))

依存: A08, B01。ブランチ候補: `fix/events-responsive-view`。

保存済み表示選択がないモバイルではgridを初期値とし、ユーザーが選んだモードは尊重する。PCは日程表を維持できる。日程帯は淡い背景と濃い文字に変更し、種別・状態はラベルでも伝える。行高を32px以上の設計目標とし、日付・タイトル・店舗を追いやすくする。「一覧／日程」の文字付き切替、横スクロールのヒントと当日位置への導線を用意する。

対象: `src/app/routes/events/index.tsx`, `src/atoms/event-view-mode-atom.ts`, `src/components/events/gantt/gantt-header.tsx`, `src/components/events/gantt/gantt-row.tsx`, `src/components/events/gantt/gantt-timeline.tsx`, `src/themes/light.css`, `src/themes/dark.css`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxの新規セッションではカード一覧が初期表示、手動で選んだ日程モードは維持
- [ ] 768/1024/1280/1440pxで一覧と日程を名前付き操作で切り替えられる
- [ ] 日程表の文字と背景は4.5:1以上を設計目標として実測
- [ ] 日程内部だけが横スクロールし、ページ全体は横に溢れない

検証候補: `e2e/events-responsive-view.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B03: カレンダーの月選択と店舗名を画面幅に合わせて表示 ([#61](https://github.com/qtmleap/biccame-musume/issues/61))

依存: A10, B01。ブランチ候補: `fix/calendar-responsive-controls`。

月選択は数字付き（例「10月」）に統一。狭い幅は横スクロール可能な左寄せ領域とし、選択中の月を可視範囲に保つ。PCでは12か月が収まる幅で中央配置する。店舗欄は表示用に共通接頭辞「ビックカメラ」を省いて店舗識別部を優先し、完全名は詳細に残す。PC日付セルは名前または説明付き画像を適切なサイズで表示。

対象: `src/components/calendar/calendar-controls.tsx`, `src/components/calendar/calendar-event-list.tsx`, `src/components/calendar/calendar-grid.tsx`, `src/components/calendar/calendar-event-drawer-content.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxで移動先の月が数字で分かり、1月から12月まで選択可能
- [ ] 768pxの境界を含め、先頭・末尾の月が画面外に固定されず到達可能
- [ ] 狭い幅でも岡山駅前店/高槻阪急スクエア店など店舗識別部が読める
- [ ] PC日付セルとモバイル一覧から同じ対象の詳細を開ける

検証候補: `e2e/calendar-responsive-controls.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B04: キャラクター一覧に店舗情報と名前検索を追加 ([#62](https://github.com/qtmleap/biccame-musume/issues/62))

依存: B01, A10。ブランチ候補: `feat/character-search-and-store-label`。

名前の下へ店舗名・地域を追加し、320pxでも名前と店舗が操作ボタンと重ならないレイアウトにする。検索は取得済みcharactersを使って名前・別名・店舗名を部分一致、空白除去とかな表記を既存変換ライブラリで正規化。地域フィルターと検索をAND条件にし、件数・0件説明・条件解除を表示。追加APIは作らない。

対象: `src/app/routes/characters/index.tsx`, `src/components/character-list-card.tsx`, `src/components/characters/character-list.tsx`, `src/utils/character.ts`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 名前・別名・店舗名から同一キャラクターを探せる
- [ ] 320/375/430pxでカードの文字とフォロー/投票操作が重ならない
- [ ] 768/1024/1440pxで列数の変更後も文字幅とカード高が揃う
- [ ] 検索0件では説明と解除があり、Tabで検索・カード詳細・操作に到達可能

検証候補: `e2e/character-search-layout.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B05: キャラクター詳細の画像と情報階層を整理 ([#63](https://github.com/qtmleap/biccame-musume/issues/63))

依存: B01, A10。ブランチ候補: `refactor/character-detail-layout`。

既存画像を使い、プロフィール画像をモバイル96〜128px、PC128〜160pxの範囲で配置する設計案。画像の解像度を確認して無理に拡大しない。プロフィール・直近イベント・店舗情報を余白と面で区分。PCは近隣一覧を補助列として扱い、狭い幅は主要情報の後に配置。新しいイラスト制作は対象外。

対象: `src/components/characters/detail/character-profile-section.tsx`, `src/components/characters/detail/store-info-section.tsx`, `src/components/characters/character-detail-content.tsx`, `src/components/characters/nearby-characters-list.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxでプロフィール・操作・見出しが重ならず順序が自然
- [ ] 768/1024/1440pxで主情報と補助情報が区別できる
- [ ] 店舗名・住所・電話・営業時間が十分な文字サイズで読める
- [ ] 画像の縦横比を保ち、輪郭や文字が不自然にぼけない

検証候補: `e2e/character-detail-layout.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B06: 店舗マップの重なるピンと地域選択を改善 ([#64](https://github.com/qtmleap/biccame-musume/issues/64))

依存: A13。ブランチ候補: `feat/map-cluster-and-region`。

低ズームでは件数付きクラスター、高ズームでは個別ピンにする。地域選択と「全店舗を表示」を用意し、対象店舗boundsへ調整。PCは一覧パネル、モバイルはボトムシートに合わせて地図の可視bounds/paddingを調整。地図SDK互換を確認し必要ならクラスタリング専用ライブラリだけ追加可。座標欠損の扱いはA13に従う。

対象: `src/app/routes/location/index.tsx`, `src/components/store-list-item.tsx`, `src/components/selected-store-info.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxの全国表示で密集地域の店舗数が読める
- [ ] 768/1024/1440pxでもクラスターから地域・個別店舗へ移動可能
- [ ] 選択店舗のピンがヘッダー/一覧パネル/シートの裏へ隠れない
- [ ] 座標欠損店舗を誤った場所に表示しない

検証候補: `e2e/map-cluster-responsive.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B07: 一覧カードの傾き・影・余白を統一 ([#65](https://github.com/qtmleap/biccame-musume/issues/65))

依存: B04, B02。ブランチ候補: `refactor/card-surface-layout`。

密度の高い一覧は回転0〜0.5度を設計目標として抑え、影を弱める。テープ・角丸・ブランドカラーを維持。ランキング上位など演出的なカードは別の役割として扱う。カードpaddingとgapは画面ごとの比較情報を基準に統一。

対象: `src/lib/sticker.ts`, `src/components/character-list-card.tsx`, `src/components/home/event-list-item.tsx`, `src/components/events/event-grid-item.tsx`, `src/components/ranking/ranking-row.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxで一覧の文字と操作の基準線が揃う
- [ ] 768/1024/1440pxでカードの傾きにより隣のカードへ重ならない
- [ ] hover/focusで重なりや切れがなく、押下対象を識別できる
- [ ] 変更前後を同じデータ・幅で撮影し、ブランドの雰囲気を確認

検証候補: `e2e/card-surface-layout.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B08: イベントフィルターに件数と適用完了の導線を表示 ([#66](https://github.com/qtmleap/biccame-musume/issues/66))

依存: A08, A10, B02。ブランチ候補: `feat/event-filter-result-action`。

実際に表示するactiveEvents.lengthで「N件を表示」ボタンをシート下部へ固定し、クリックで閉じる。条件変更は既存どおり即時反映、ボタンは保存処理ではない。クリアは副操作にする。モバイル/PCとも適用中条件の要約と件数を表示し、0件でも解除と条件変更ができる。

対象: `src/app/routes/events/index.tsx`, `src/components/events/event-category-filter.tsx`, `src/components/events/event-status-filter.tsx`, `src/components/events/event-store-filter.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxで最後の条件と下部操作が隠れずスクロール可能
- [ ] 件数が実際のフィルター結果と一致し、ボタンでシートを閉じる
- [ ] 0件でも条件を変更・クリアできる
- [ ] 768/1024/1440pxのインラインフィルターでも同じ結果件数が分かる

検証候補: `e2e/event-filter-sheet-layout.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

### B09: 経路計算の初期画面に操作手順と無効理由を表示 ([#67](https://github.com/qtmleap/biccame-musume/issues/67))

依存: A05, A06, A10。ブランチ候補: `feat/route-onboarding`。

初期画面に「店舗を2〜5件選択」「利用駅を確認」「訪問順を計算」の手順を示す。無効な探索ボタンの近くへ不足条件を表示し、条件を満たすと説明を更新。PCはフォーム幅を制限して左側の空白を抑え、モバイルは縦順にする。AI参考値の説明はA05と一致させる。

対象: `src/app/routes/route/index.tsx`, `src/components/route/store-select.tsx`, `src/components/route/selected-store-list.tsx`。

手順: 対象コンポーネントと現在の状態保存を確認 → 既存API契約を維持して画面を変更 → 以下の条件を同じデータで確認 → 独立PRとしてレビュー。

- [ ] 320/375/430pxで必要店舗数と次の操作が読める
- [ ] 768/1024/1440pxでも入力と説明が離れすぎず同じ領域で確認できる
- [ ] 0件/1件/駅未設定の無効理由を区別する
- [ ] 入力だけの確認ではAI呼出しを行わず、探索時の説明はA05と一致

検証候補: `e2e/route-empty-state-layout.spec.ts`。純粋な見た目変更は比較撮影を中心にし、検索・モード保存・選択・シート開閉は挙動をassertする。未作成テストの成功を主張しない。

検証幅は320/375/430/768/1024/1280/1440px。特に768pxの月選択境界を回帰ケースにする。ライト/ダーク、長い名称、0件、読み込み、エラー、キーボード操作を変更対象に合わせて確認。代表画像はdocs/reviews/2026-10-02-ui-ux/screenshotsへ保存済み。
