# UI UX と設計の改善課題一覧

GitHub管理課題: [#58](https://github.com/qtmleap/biccame-musume/issues/58)。

作成日: 2026-10-02

主要画面、認証・キャッシュ・日付処理、API・サービス・Prisma・Workersを3名のサブエージェントと親エージェントで調査した結果を、24件の対応課題（初回15件＋視覚レビュー9件）に整理する。コード参照から確認した条件付き挙動が中心であり、実環境の発生頻度を示すものではない。

## 対象と検証状況

対象はキャラクター一覧・詳細、イベント一覧・詳細・管理、カレンダー、地図、経路、ランキング、マイページ、PWAと共通ナビゲーション。

- 関連する既存ユニットテスト63件成功、0件失敗。今回の問題を直接検証するテストとは限らない。
- 誕生日の日数計算で2026-10-02基準の10月1日と10月3日が共に1日となることを実行確認。
- 初回ローカル表示はタイムアウト・空画面。後続で公開版をPlaywright MCPで撮影し、375/1280pxと追加26組合せを確認。[追加視覚レビュー](2026-10-02-responsive-visual-review.md)参照。実認証、ダークテーマ、スクリーンリーダー、実環境の負荷は未検証。
- 座標欠損店舗の現行データへの存在、Cloudflare Accessの実環境ポリシー、D1 adapterのトランザクション原子性は未確認。原子性問題は確定課題に含めない。
- 管理APIのCFAuth、Cookie UIDによる活動データ絞り込み、コメントの本文検証・モデレーションは確認済み。既存の保護を撤去しない。

## 共通要件

- アプリは日本語の既存UIを維持し、失敗・参考情報・未登録状態を利用者へ正確に説明する。
- FirebaseとAPIのログアウトを一致させ、他ユーザーのキャッシュを表示しない。
- 実在する投票対象だけを保存する。非信頼ヘッダーで制限枠を変えない。
- 開催状態・投票制限・年度はAsia/Tokyo基準に統一する。
- AI推測の経路を確定情報や最短経路として表示しない。
- 認証、非同期処理、取得失敗に再試行か安全な遷移を用意する。
- キーボード操作・操作名・選択状態をモバイルとデスクトップの両方で提供する。
- 課題の修正は独立したPRに分け、developへ送る。develop/masterへ直接コミットしない。
- index.cssおよびsrc/components/ui/**/*.tsxは直接編集しない。
- 現行依存関係を優先し、本計画のためだけにUIフレームワークを追加しない。
- 本作業は課題と計画の作成まで。修正実装・デプロイ・告知投稿は開始しない。

## 課題一覧

P1は認証・データ信頼性・資源消費を優先して対応、P2は利用時の誤表示・操作・運用整合性、P3は探索・共有の設計改善。期限や担当者は未割当で、優先順位は実施順を示す。

| ID | 優先度 | 課題 | 依存 |
|---|---|---|---|
| A01 | P1 | [ログアウト時のセッション失効とユーザー別キャッシュ分離](#a01) | なし |
| A02 | P1 | [認証失敗からの復帰と未ログインのマイページ遷移を修正](#a02) | A01 |
| A03 | P1 | [投票対象IDの検証と信頼できるレート制限キー](#a03) | なし |
| A04 | P1 | [経路生成APIの入力サイズとAI使用量を制限](#a04) | なし |
| A05 | P1 | [経路結果の失敗状態・推測値・距離表示を正確にする](#a05) | A04 |
| A06 | P2 | [経路探索中の入力変更で古い結果を表示しない](#a06) | A05 |
| A07 | P2 | [投票・イベントのJST日付更新と年末補償処理を統一](#a07) | A03 |
| A08 | P2 | [イベント取得エラー・ページ番号・統計取得上限を修正](#a08) | なし |
| A09 | P2 | [次の誕生日までの日数で並び替える](#a09) | A07 |
| A10 | P2 | [操作ラベル・選択状態・モバイルメニューのアクセシビリティ統一](#a10) | なし |
| A11 | P2 | [投票DOの不要なalarm予約を停止](#a11) | A07 |
| A12 | P2 | [イベント再送時の告知重複を防止](#a12) | なし |
| A13 | P2 | [座標未登録の店舗を誤った場所に表示しない](#a13) | なし |
| A14 | P3 | [初訪問の導線とフィルター共有方針を整理](#a14) | A08, A10 |
| A15 | P2 | [UI回帰を検出する検証とstaging確認を整備](#a15) | A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, A13, A14 |

## A01

**ログアウト時のセッション失効とユーザー別キャッシュ分離**

- 優先度: P1 / フェーズ1
- GitHub: [#43](https://github.com/qtmleap/biccame-musume/issues/43)
- 状態: 未着手

### 根拠と影響

Firebase signOut 後も5日有効のsession Cookieが残る。お気に入り・活動・獲得バッジの固定query keyが永続化され、アカウント変更時に以前の情報を復元し得る。

確認対象: `src/api/auth.ts`、`src/utils/client.ts`、`src/hooks/use-auth.ts`、`src/components/auth/auth-provider.tsx`、`src/hooks/use-favorites.ts`、`src/hooks/use-user-activity.ts`、`src/hooks/use-badges.ts`、`src/hooks/use-push-stream.ts`、`src/app/main.tsx`。

### 対応方針

POST /api/auth/logout を追加し、session Cookieをpath=/で失効。成功後にFirebase signOut、ユーザーキャッシュ削除、画面遷移。失効失敗時はログアウト完了扱いにしない。src/lib/user-query-keys.ts を新設し userQueryKeys.favorites(uid)、activities(uid)、badges(uid) を ['user',uid,resource] に統一。ユーザークエリはmeta.persist=falseにし、旧 ['me',...] と ['user_activities'] の保存データも復元前に除去。Push通知とmutationのinvalidateも同じキーを使用。

### 完了条件と検証

- [ ] logout_then_protected_api_returns_401：ログアウト後のCookie jarで認証必須APIが401
- [ ] account_switch_does_not_restore_previous_user_data：A→ログアウト→BでAの推し・活動・獲得バッジが表示されない
- [ ] logout_failure_keeps_retry_available：失効失敗時に完了表示へ進まず再試行できる
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/auth-session-and-user-cache`。

## A02

**認証失敗からの復帰と未ログインのマイページ遷移を修正**

- 優先度: P1 / フェーズ1
- GitHub: [#44](https://github.com/qtmleap/biccame-musume/issues/44)
- 状態: 未着手

### 根拠と影響

バックエンド認証失敗をfalseだけで表現し、保護画面がloadingのままになる。/me のbeforeLoadはcallback内throwにより外側Promiseをrejectしない。

確認対象: `src/atoms/auth-atom.ts`、`src/components/auth/auth-provider.tsx`、`src/components/auth/backend-session-gate.tsx`、`src/hooks/use-auth.ts`、`src/app/routes/me/index.tsx`。

### 対応方針

BackendSessionState を {status:'idle'|'pending'} | {status:'ready';uid:string} | {status:'error';message:string} と定義。backendSessionReadyはreadyから導出し二重管理を避ける。src/lib/auth-session.ts のestablishBackendSession():Promise<void> をproviderと再試行から利用。Firebase UIDが変わればpendingに戻し、古いUIDの遅い応答を採用しない。全保護ルートのbeforeLoadを監査し、非同期認証確認のresolve/rejectとredirectを保証する。

### 完了条件と検証

- [ ] anonymous_me_redirects_without_pending_navigation：匿名 /me はホームへ遷移
- [ ] backend_auth_failure_shows_retry：/api/authの500でエラーと再試行ボタン
- [ ] stale_auth_response_is_ignored：Aの認証応答がBのready状態を作らない
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A01。ブランチ案: `fix/auth-recovery`。

## A03

**投票対象IDの検証と信頼できるレート制限キー**

- 優先度: P1 / フェーズ1
- GitHub: [#45](https://github.com/qtmleap/biccame-musume/issues/45)
- 状態: 未着手

### 根拠と影響

任意の非空characterIdを保存できる。レート制限キーは未検証Authorizationヘッダーを優先し、値の変更で制限枠を変えられる。

確認対象: `src/api/vote.ts`、`src/schemas/vote.dto.ts`、`src/services/vote-service.ts`、`src/utils/character-whitelist.ts`、`src/middleware/ip-check.ts`。

### 対応方針

既存loadBiccameMusumeIdSetで単発・一括の全IDをclaim前に検証。不明IDを含むリクエストは400で全体拒否し、DO/DBに触れない。whitelist読込失敗は正常な空集合と区別して503。ipCheck後に検証済みCLIENT_IPを制限キー vote:<ip> に使い、Authorization文字列をキーにしない。既存50件/60秒の設定を維持する。

### 完了条件と検証

- [ ] unknown_vote_id_has_no_side_effects：不明IDで400かつclaim/DB呼出し0
- [ ] mixed_bulk_vote_is_rejected_before_claim：実在と架空の混在でも保存0
- [ ] authorization_changes_do_not_change_limit_bucket：異なるヘッダーでも同IPは同枠
- [ ] whitelist_failure_returns_503：データ取得失敗を不明ID400にしない
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/vote-input-and-rate-limit`。

## A04

**経路生成APIの入力サイズとAI使用量を制限**

- 優先度: P1 / フェーズ1
- GitHub: [#46](https://github.com/qtmleap/biccame-musume/issues/46)
- 状態: 未着手

### 根拠と影響

公開/api/directionsが匿名で毎回AIを実行し、駅名・店舗名の文字数上限と呼び出し制限がない。

確認対象: `src/api/direction.ts`、`src/schemas/route.dto.ts`、`src/types/bindings.ts`、`wrangler.toml`、`src/middleware/ip-check.ts`。

### 対応方針

提案値として駅名・店舗名を各100文字、bodyを8KiB、既存区間数上限5件に制限。DIRECTIONS_RATE_LIMITERをlocal/staging/productionへ追加しIPごと10件/60秒。超過は429、サイズ超過は413。検証と制限はai.run前。正常応答のみ正規化した経路キーで10分キャッシュし、degradedは保存しない。閾値はstaging計測後に調整可能な設定として扱う。

### 完了条件と検証

- [ ] oversized_input_never_calls_ai：101文字/8KiB超過でAI呼出し0
- [ ] rate_limit_denial_never_calls_ai：制限拒否で429かつAI呼出し0
- [ ] identical_route_reuses_cache：同一経路は正常応答を再利用、失敗はキャッシュしない
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/directions-resource-limits`。

## A05

**経路結果の失敗状態・推測値・距離表示を正確にする**

- 優先度: P1 / フェーズ2
- GitHub: [#47](https://github.com/qtmleap/biccame-musume/issues/47)
- 状態: 未着手

### 根拠と影響

取得失敗が0分となり概算と説明される。degradedのroutes:[]はnonemptyスキーマと矛盾。平面座標距離を111倍して総移動距離・最短ルートと表示し、LLM推測値も通常の経路案内に見える。

確認対象: `src/schemas/route.dto.ts`、`src/api/direction.ts`、`src/components/route/types.ts`、`src/components/route/use-directions.ts`、`src/components/route/route-result.tsx`、`src/app/routes/route/index.tsx`、`src/utils/tsp.ts`。

### 対応方針

RouteResponseSchemaをdiscriminated unionにし、成功 {status:'estimated';legs:LegResponse[]}、失敗 {status:'unavailable';reason:'generation_failed'} とする。空路線を正常値にせず、サーバー出力で要求区間との一致・件数・非負時間を検証。画面の失敗時コピーは「所要時間を取得できませんでした」。成功にも「AIによる参考経路」と外部経路検索への導線を表示。球面距離calcGreatCircleKm(a:Point,b:Point):numberを使い「店舗間の直線距離」「直線距離を基準にした訪問順」と表示、交通での最短を保証しない。

### 完了条件と検証

- [ ] failed_route_has_no_zero_minute_label：失敗結果に0分/概算表示がない
- [ ] route_response_union_accepts_unavailable：失敗応答も宣言スキーマを通る
- [ ] mismatched_ai_legs_are_unavailable：要求と違う駅・件数/負の時間を拒否
- [ ] great_circle_distance_uses_longitude_scale：同緯度35度で経度1度差は約91kmで111kmにならない
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A04。ブランチ案: `fix/route-result-contract`。

## A06

**経路探索中の入力変更で古い結果を表示しない**

- 優先度: P2 / フェーズ2
- GitHub: [#48](https://github.com/qtmleap/biccame-musume/issues/48)
- 状態: 未着手

### 根拠と影響

探索中も店舗・駅変更と全クリアが可能。変更後に旧リクエストが完了すると古い結果が復活する。

確認対象: `src/app/routes/route/index.tsx`、`src/components/route/use-directions.ts`。

### 対応方針

getDirections(route,signal?:AbortSignal)にキャンセルを追加。入力変更・全クリア・unmountでAbortControllerを中止しrequest generationを更新。最新世代だけがsetResult/isCalculatingを更新。AbortErrorは警告や失敗結果へ変換しない。

### 完了条件と検証

- [ ] clear_during_calculation_keeps_result_empty：全クリア後に遅い応答を返しても結果なし
- [ ] station_change_discards_previous_response：駅変更前の応答は不採用
- [ ] abort_does_not_show_failure_toast：キャンセルで警告なし
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A05。ブランチ案: `fix/route-request-race`。

## A07

**投票・イベントのJST日付更新と年末補償処理を統一**

- 優先度: P2 / フェーズ2
- GitHub: [#49](https://github.com/qtmleap/biccame-musume/issues/49)
- 状態: 未着手

### 根拠と影響

投票UIはローカル日付と時刻依存なしmemoを使う。イベントlast_dayが翌日も開催中扱いになる。集計取得年はUTCになり得る。投票releaseはclaim時と違う日付/年度を再計算する。

確認対象: `src/utils/vote.ts`、`src/services/vote-service.ts`、`src/services/event-service.ts`、`src/components/characters/character-vote-button.tsx`、`src/components/characters/bulk-vote-button.tsx`、`src/app/routes/events/index.tsx`。

### 対応方針

src/utils/jst-date.ts にgetJstDateKey(now:string):string、getJstYear(now:string):number、getNextJstMidnight(now:string):stringを用意し既存vote utilを互換ラッパーにする。src/hooks/use-jst-date.ts がJST午前0時とvisibilitychangeで日付stateを更新。src/utils/event-status.ts のcalculateEventStatus(event,nowIso)をサーバーとUIで共有し、古いlast_dayによる上書きを廃止。投票開始時にVoteContext={dateKey,year,stub}を固定しclaim/DB/releaseへ渡す。

### 完了条件と検証

- [ ] utc_device_vote_unlocks_at_jst_midnight：UTC端末でもJST境界でボタン解除
- [ ] last_day_becomes_ended_after_midnight：翌日に終了フィルタへ移る
- [ ] new_year_read_and_write_same_year：元日UTC15時境界で取得/保存年度一致
- [ ] release_uses_original_context：年跨ぎのDB失敗でも元のDOとdateKeyを解放
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A03。ブランチ案: `fix/jst-date-consistency`。

## A08

**イベント取得エラー・ページ番号・統計取得上限を修正**

- 優先度: P2 / フェーズ2
- GitHub: [#50](https://github.com/qtmleap/biccame-musume/issues/50)
- 状態: 未着手

### 根拠と影響

useEventOrNullが全例外をnullへ変換し通常詳細と同一keyへ保存する。対象件数減少でページ範囲外になり空グリッド。stats eventIdsが無制限でそのままINクエリへ渡る。

確認対象: `src/hooks/use-events.ts`、`src/components/events/paginated-event-grid.tsx`、`src/app/routes/events/index.tsx`、`src/app/routes/admin/events/new/index.tsx`、`src/api/event.ts`、`src/services/me-service.ts`。

### 対応方針

optional/detailのキャッシュ契約を分離しquery key ['events','optional',id] とする。404だけnull、500/通信失敗はthrow。PaginatedEventGridでeffectivePage=clamp(page,1,max(1,totalPages))を使って描画し、所有stateも補正。statsは重複除去後最大50ID、ID各100文字、超過400。クライアントは50件ずつ分割して取得する。空状態は「条件に一致するイベントはありません」と条件解除を表示。

### 完了条件と検証

- [ ] optional_event_500_does_not_return_null：500でerror、404でnull
- [ ] shrinking_results_clamps_page：13件→12件で1ページを表示し13–12表記なし
- [ ] stats_over_limit_is_rejected：51個の異なるIDで400、DB呼出し0
- [ ] filtered_empty_state_offers_reset：0件で条件解除が使える
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/event-query-and-pagination`。

## A09

**次の誕生日までの日数で並び替える**

- 優先度: P2 / フェーズ2
- GitHub: [#51](https://github.com/qtmleap/biccame-musume/issues/51)
- 状態: 未着手

### 根拠と影響

絶対値比較により昨日と明日の誕生日をどちらも1日と算出する。

確認対象: `src/utils/character.ts`。

### 対応方針

getDaysFromBirthday(dateStr,nowIso?:string):numberをJST日付基準の次回までの非負日数にする。当日は0、今年過ぎたら翌年へ。2月29日は非うるう年に2月28日として扱う（計画上の方針）。不正/未設定はNumber.MAX_SAFE_INTEGERを維持。

### 完了条件と検証

- [ ] past_birthday_is_next_year：基準2026-10-02、10/1は364、10/3は1
- [ ] birthday_today_is_zero：同日0
- [ ] leap_day_policy_is_feb28：非うるう年2/28が0
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A07。ブランチ案: `fix/upcoming-birthday-sort`。

## A10

**操作ラベル・選択状態・モバイルメニューのアクセシビリティ統一**

- 優先度: P2 / フェーズ3
- GitHub: [#52](https://github.com/qtmleap/biccame-musume/issues/52)
- 状態: 未着手

### 根拠と影響

イベント/カレンダー/ルートのアイコン操作名、地域/月の選択状態が不足。メニューのEscape/フォーカス管理なし。モバイル並び替えは閉じてもDOMにボタンが残りTab可能。ルート全体select-noneが説明や住所のコピーを妨げる。

確認対象: `src/components/common/header.tsx`、`src/components/characters/region-filter-control.tsx`、`src/components/characters/character-sort-control.tsx`、`src/components/calendar/calendar-controls.tsx`、`src/components/route/selected-store-list.tsx`、`src/app/routes/events/index.tsx`、`src/app/routes/__root.tsx`。

### 対応方針

メニューは既存SheetでEscape・フォーカス復帰・背面制御を提供。操作名は「前の月」「次の月」「イベントを絞り込む」「一覧表示」「日程表示」「{店舗名}をルートから削除」「{店舗名}の利用駅」。単一地域選択はRadioGroup、月選択はaria-pressed。閉じた並び替えの操作はhidden/inertでフォーカスと読み上げ対象から除外し、デスクトップ表示を維持。select-noneは必要な装飾だけへ限定。uiディレクトリは編集しない。

### 完了条件と検証

- [ ] menu_escape_restores_focus：Escape後にトリガーへ戻る
- [ ] closed_sort_has_no_focusable_options：375px閉状態でTab対象に並び替え候補なし
- [ ] controls_have_names_and_selected_state：操作名と地域/月の選択状態をroleで取得可能
- [ ] desktop_sort_remains_visible：1280pxで候補を操作可能
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/accessibility-controls`。

## A11

**投票DOの不要なalarm予約を停止**

- 優先度: P2 / フェーズ3
- GitHub: [#53](https://github.com/qtmleap/biccame-musume/issues/53)
- 状態: 未着手

### 根拠と影響

一度初期化された年別DOがdirtyなしでも5秒ごとにalarmを再予約し続け、終了年度にも動き続ける。

確認対象: `src/durable-objects/vote-counter.ts`、`src/services/vote-service.ts`。

### 対応方針

投票変更時に保存用alarmを予約し、flush後にdirty=falseなら短期alarmを停止。daily_votedのpruneはclaim時に日付変更を検知して実施。既存alarmを受けても再予約せず終了。snapshotとD1集計の復元・release時の変更も保存対象として確認。

### 完了条件と検証

- [ ] clean_alarm_is_not_rescheduled：dirty=falseのalarmでsetAlarmなし
- [ ] vote_schedules_single_flush：複数変更で保存予約を重複しない
- [ ] restart_restores_snapshot：flush後再起動でカウンタ復元
- [ ] new_day_prunes_old_claims：日付変更claimで古い履歴を除去
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A07。ブランチ案: `fix/vote-counter-alarm`。

## A12

**イベント再送時の告知重複を防止**

- 優先度: P2 / フェーズ3
- GitHub: [#54](https://github.com/qtmleap/biccame-musume/issues/54)
- 状態: 未着手

### 根拠と影響

同じUUIDのcreateEventは既存イベントを返すが、APIは常にtweetEventCreatedを呼ぶ。DB冪等性が告知へ及ばない。

確認対象: `src/services/event-service.ts`、`src/api/event.ts`、`src/utils/twitter.ts`。

### 対応方針

createEventの戻り値を {event:EventDetail,created:boolean} にし利用箇所を更新。created=trueかつshouldTweet!==falseだけ告知。同時作成のunique競合は既存取得created=falseへ。外部投稿の再送までexactly-onceは保証しない。投稿失敗の自動再送/outboxは本課題の対象外とし別途要件がある場合に追加。

### 完了条件と検証

- [ ] same_uuid_posts_announcement_once：連続2POSTで告知呼出し1
- [ ] concurrent_uuid_has_one_creator：同時競合で新規作成扱いは1件
- [ ] tweet_failure_does_not_duplicate_event：告知失敗後の再送でもDB重複なし
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/event-announcement-idempotency`。

## A13

**座標未登録の店舗を誤った場所に表示しない**

- 優先度: P2 / フェーズ3
- GitHub: [#55](https://github.com/qtmleap/biccame-musume/issues/55)
- 状態: 未着手

### 根拠と影響

住所ありの店舗を地図に含め、座標未登録時は東京駅へフォールバックする。現行データに該当店舗があるかは未確認。

確認対象: `src/app/routes/location/index.tsx`、`src/components/store-list-item.tsx`、`src/components/selected-store-info.tsx`。

### 対応方針

地図マーカーは有限かつ範囲内のcoordinatesがある店舗だけ。座標なし店舗は一覧に残して「地図位置未登録」と表示、選択時に東京駅へパンしない。東京駅は地図の初期中心としてのみ利用可。

### 完了条件と検証

- [ ] missing_coordinate_has_no_marker：座標なし店舗にマーカーなし
- [ ] missing_coordinate_remains_in_list：一覧と未登録説明を表示
- [ ] select_missing_coordinate_does_not_pan：既存地図中心を変更しない
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: なし。ブランチ案: `fix/map-missing-coordinates`。

## A14

**初訪問の導線とフィルター共有方針を整理**

- 優先度: P3 / フェーズ4
- GitHub: [#56](https://github.com/qtmleap/biccame-musume/issues/56)
- 状態: 未着手

### 根拠と影響

トップ冒頭に主要探索への入口がない。店舗はURL、その他は永続atomで共有URLが一覧条件を再現しない。地域共有が別画面へ影響する。これは設計改善であり混在自体を不具合とは断定しない。

確認対象: `src/components/home/home-header.tsx`、`src/app/routes/events/index.tsx`、`src/app/routes/characters/index.tsx`、`src/atoms/filter-atom.ts`、`src/atoms/event-page-atom.ts`。

### 対応方針

トップに「娘を探す」「イベントを探す」「店舗マップ」のリンクを追加。イベント検索条件category/status/region/store/pageをvalidateSearchのURLへ集約。画面幅による表示方式など個人設定だけlocalStorageへ。キャラ地域とイベント地域は独立させ、URL未指定の既定地域all。後方互換として?store=は維持。既存永続フィルターのURLなし初回への移行は行わず既定値を採用。

### 完了条件と検証

- [ ] shared_url_reproduces_filters：異なる保存設定のブラウザでも同URLで同条件
- [ ] character_region_does_not_change_events：キャラ側変更がイベントへ影響しない
- [ ] home_primary_links_are_available：375/1280pxで3導線を操作可能
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A08, A10。ブランチ案: `feat/navigation-and-filter-sharing`。

## A15

**UI回帰を検出する検証とstaging確認を整備**

- 優先度: P2 / フェーズ4
- GitHub: [#57](https://github.com/qtmleap/biccame-musume/issues/57)
- 状態: 未着手

### 根拠と影響

既存visual-check/sticky-checkはスクリーンショットを書き出すだけで差分や期待動作をassertしない。今回ブラウザはtimeout/空画面となり、表示・実認証・コントラストは未検証。63既存テスト成功は今回の全指摘の解消を証明しない。

確認対象: `e2e/visual-check.spec.ts`、`e2e/sticky-check.spec.ts`、`e2e/routes.test.ts`、`playwright.config.ts`、`.github/workflows/integration.yaml`。

### 対応方針

主要画面に見出し・エラー非表示・操作期待値のassertを追加。visualは固定時計/fixture/SW無効/animations無効でtoHaveScreenshotへ移行し、375pxと1280pxの基準画像をレビュー。CIにPlaywright用local DB migrate/fixture/auth emulatorの起動停止を組み込み、productionへアクセスしない。stagingでログアウトCookie、UTC/JST、地図欠損、キーボード、ライト/ダークのコントラストを実測し証跡を残す。

### 完了条件と検証

- [ ] visual_change_fails_instead_of_overwriting：意図的差分で失敗し基準画像を書換えない
- [ ] route_200_with_error_screen_fails：HTTP200でもエラー画面を成功扱いしない
- [ ] sticky_header_position_is_asserted：スクロール後の期待位置をassert
- [ ] 対象テスト、型チェック、変更ファイルのlintが成功し、PRレビューで確認する。

依存: A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, A13, A14。ブランチ案: `test/ui-regression-and-staging-check`。


## 設計改善と不具合の区別

A14のURLとatomの混在は設計選択であり、混在自体を不具合とは断定しない。フィルターを共有・再現できることを本計画の新しい仕様として定める。トップ導線も改善提案である。

A04の100文字・8KiB・10件/60秒・10分キャッシュ、A08の50ID、A09の2月29日の扱いは計画上の提案値であり、外部サービスの既定値や制約ではない。


## 追加視覚レビュー課題

デスクトップとモバイルの両方を受け入れ基準に含める。以下は未着手。

| ID | 優先度 | GitHub課題 | 依存 |
|---|---|---|
| B01 | P2 | [#59 補足文字の読みやすさと狭い画面のタイトル省略を改善](https://github.com/qtmleap/biccame-musume/issues/59) | A10 |
| B02 | P2 | [#60 イベント一覧の日程表を読みやすくしモバイルの初期表示を改善](https://github.com/qtmleap/biccame-musume/issues/60) | A08, B01 |
| B03 | P2 | [#61 カレンダーの月選択と店舗名を画面幅に合わせて表示](https://github.com/qtmleap/biccame-musume/issues/61) | A10, B01 |
| B04 | P2 | [#62 キャラクター一覧に店舗情報と名前検索を追加](https://github.com/qtmleap/biccame-musume/issues/62) | B01, A10 |
| B05 | P3 | [#63 キャラクター詳細の画像と情報階層を整理](https://github.com/qtmleap/biccame-musume/issues/63) | B01, A10 |
| B06 | P2 | [#64 店舗マップの重なるピンと地域選択を改善](https://github.com/qtmleap/biccame-musume/issues/64) | A13 |
| B07 | P3 | [#65 一覧カードの傾き・影・余白を統一](https://github.com/qtmleap/biccame-musume/issues/65) | B04, B02 |
| B08 | P2 | [#66 イベントフィルターに件数と適用完了の導線を表示](https://github.com/qtmleap/biccame-musume/issues/66) | A08, A10, B02 |
| B09 | P3 | [#67 経路計算の初期画面に操作手順と無効理由を表示](https://github.com/qtmleap/biccame-musume/issues/67) | A05, A06, A10 |

## B01

## 確認した問題

公開版で日付・店舗など判断に必要な補足情報が12px。ピンク背景上の14px一覧リンクは測定コントラスト約4.11:1。320px幅ではホームの長いイベント名が1行省略になる。白背景の補足文字は測定約4.83:1であり、全ての灰色文字が不適合という指摘ではない。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

日付・店舗の補足文字を13〜14px、本文は14〜16pxを基準として見直す。重要なリンクは背景に対するコントラスト4.5:1以上を設計目標とし、ブランドと既存テーマを維持。320/375pxではイベント名を最大2行にし、状態バッジがタイトル幅を過度に奪わない。すべての文字を一律に拡大せず優先情報に適用する。

## 対象ファイル（実装時に所在を確認）

- `src/themes/light.css`
- `src/themes/dark.css`
- `src/components/home/event-list-item.tsx`
- `src/components/home/home-header.tsx`
- `src/components/events/event-grid-item.tsx`
- `src/components/calendar/calendar-event-list.tsx`
- `src/components/characters/detail/store-info-items.tsx`

## 受け入れ基準

- [ ] 320/375/430pxで長いイベント名の重要部分が最大2行で読め、状態バッジと重ならない
- [ ] 768/1024/1280/1440pxで見出し・本文・補足の文字階層が保たれる
- [ ] 主要補足情報は13px以上、ピンク背景上の通常文字リンクは4.5:1以上を測定確認
- [ ] ライト/ダークの両方で読める。ダークは明示的なテーマ確認として扱う

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/visual-typography.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #52。管理課題: #58。計画上のID: B01。作業ブランチ候補: `fix/visual-typography`。

## 撮影根拠

- home-desktop-full.png
- home-mobile-viewport.png
- home-320-viewport.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B02

## 確認した問題

公開版の日程表は高彩度の青・紫・橙の長い帯と小さい文字が連続する。375pxでは約11日分しか見えず、横スクロールが前提でタイトル・店舗・日付を比較しにくい。横スクロール領域の存在は仕様であり、ページ全体の横はみ出しとは区別する。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

保存済み表示選択がないモバイルではgridを初期値とし、ユーザーが選んだモードは尊重する。PCは日程表を維持できる。日程帯は淡い背景と濃い文字に変更し、種別・状態はラベルでも伝える。行高を32px以上の設計目標とし、日付・タイトル・店舗を追いやすくする。「一覧／日程」の文字付き切替、横スクロールのヒントと当日位置への導線を用意する。

## 対象ファイル（実装時に所在を確認）

- `src/app/routes/events/index.tsx`
- `src/atoms/event-view-mode-atom.ts`
- `src/components/events/gantt/gantt-header.tsx`
- `src/components/events/gantt/gantt-row.tsx`
- `src/components/events/gantt/gantt-timeline.tsx`
- `src/themes/light.css`
- `src/themes/dark.css`

## 受け入れ基準

- [ ] 320/375/430pxの新規セッションではカード一覧が初期表示、手動で選んだ日程モードは維持
- [ ] 768/1024/1280/1440pxで一覧と日程を名前付き操作で切り替えられる
- [ ] 日程表の文字と背景は4.5:1以上を設計目標として実測
- [ ] 日程内部だけが横スクロールし、ページ全体は横に溢れない

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/events-responsive-view.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #50、#59。管理課題: #58。計画上のID: B02。作業ブランチ候補: `fix/events-responsive-view`。

## 撮影根拠

- events-mobile-viewport.png
- events-desktop-viewport.png
- events-grid-mobile.png
- events-320-viewport.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B03

## 確認した問題

公開版モバイルの月選択は数字なしの12個の点。320pxの店舗欄は「ビックカメラ…」までで省略され、店舗を識別しにくい。PCのキャラクター画像も日付セルに対して小さく、名前は常時見えない。 追加撮影の768pxでは数字付き月選択の1月・12月が両端で切れている。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

月選択は数字付き（例「10月」）に統一。狭い幅は横スクロール可能な左寄せ領域とし、選択中の月を可視範囲に保つ。PCでは12か月が収まる幅で中央配置する。店舗欄は表示用に共通接頭辞「ビックカメラ」を省いて店舗識別部を優先し、完全名は詳細に残す。PC日付セルは名前または説明付き画像を適切なサイズで表示。

## 対象ファイル（実装時に所在を確認）

- `src/components/calendar/calendar-controls.tsx`
- `src/components/calendar/calendar-event-list.tsx`
- `src/components/calendar/calendar-grid.tsx`
- `src/components/calendar/calendar-event-drawer-content.tsx`

## 受け入れ基準

- [ ] 320/375/430pxで移動先の月が数字で分かり、1月から12月まで選択可能
- [ ] 768pxの境界を含め、先頭・末尾の月が画面外に固定されず到達可能
- [ ] 狭い幅でも岡山駅前店/高槻阪急スクエア店など店舗識別部が読める
- [ ] PC日付セルとモバイル一覧から同じ対象の詳細を開ける

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/calendar-responsive-controls.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #52、#59。管理課題: #58。計画上のID: B03。作業ブランチ候補: `fix/calendar-responsive-controls`。

## 撮影根拠

- calendar-mobile-full.png
- calendar-desktop-full.png
- calendar-320-full.png
- calendar-768-full.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B04

## 確認した問題

公開版一覧カードは顔とキャラクター名中心で、店舗・地域を手がかりに探せない。モバイルは50件以上が1列に並び、スクロールだけで探す負担が大きい。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

名前の下へ店舗名・地域を追加し、320pxでも名前と店舗が操作ボタンと重ならないレイアウトにする。検索は取得済みcharactersを使って名前・別名・店舗名を部分一致、空白除去とかな表記を既存変換ライブラリで正規化。地域フィルターと検索をAND条件にし、件数・0件説明・条件解除を表示。追加APIは作らない。

## 対象ファイル（実装時に所在を確認）

- `src/app/routes/characters/index.tsx`
- `src/components/character-list-card.tsx`
- `src/components/characters/character-list.tsx`
- `src/utils/character.ts`

## 受け入れ基準

- [ ] 名前・別名・店舗名から同一キャラクターを探せる
- [ ] 320/375/430pxでカードの文字とフォロー/投票操作が重ならない
- [ ] 768/1024/1440pxで列数の変更後も文字幅とカード高が揃う
- [ ] 検索0件では説明と解除があり、Tabで検索・カード詳細・操作に到達可能

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/character-search-layout.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #59、#52。管理課題: #58。計画上のID: B04。作業ブランチ候補: `feat/character-search-and-store-label`。

## 撮影根拠

- characters-mobile-viewport.png
- characters-desktop-viewport.png
- characters-320-full.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B05

## 確認した問題

公開版詳細は小さいキャラクター画像に対して説明・イベント・店舗情報が同じピンク背景に連続し、PCの左右列も縦罫線中心で領域の区切りが弱い。これは視覚設計の改善提案。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

既存画像を使い、プロフィール画像をモバイル96〜128px、PC128〜160pxの範囲で配置する設計案。画像の解像度を確認して無理に拡大しない。プロフィール・直近イベント・店舗情報を余白と面で区分。PCは近隣一覧を補助列として扱い、狭い幅は主要情報の後に配置。新しいイラスト制作は対象外。

## 対象ファイル（実装時に所在を確認）

- `src/components/characters/detail/character-profile-section.tsx`
- `src/components/characters/detail/store-info-section.tsx`
- `src/components/characters/character-detail-content.tsx`
- `src/components/characters/nearby-characters-list.tsx`

## 受け入れ基準

- [ ] 320/375/430pxでプロフィール・操作・見出しが重ならず順序が自然
- [ ] 768/1024/1440pxで主情報と補助情報が区別できる
- [ ] 店舗名・住所・電話・営業時間が十分な文字サイズで読める
- [ ] 画像の縦横比を保ち、輪郭や文字が不自然にぼけない

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/character-detail-layout.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #59、#52。管理課題: #58。計画上のID: B05。作業ブランチ候補: `refactor/character-detail-layout`。

## 撮影根拠

- characters-abeno-mobile-viewport.png
- characters-abeno-desktop-full.png
- characters-abeno-320-full.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B06

## 確認した問題

公開版全国表示では東京・大阪付近の同色ピンが重なり、PC/モバイルとも個別店舗を選びにくい。店舗一覧は小さなフローティング入口のみ。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

低ズームでは件数付きクラスター、高ズームでは個別ピンにする。地域選択と「全店舗を表示」を用意し、対象店舗boundsへ調整。PCは一覧パネル、モバイルはボトムシートに合わせて地図の可視bounds/paddingを調整。地図SDK互換を確認し必要ならクラスタリング専用ライブラリだけ追加可。座標欠損の扱いはA13に従う。

## 対象ファイル（実装時に所在を確認）

- `src/app/routes/location/index.tsx`
- `src/components/store-list-item.tsx`
- `src/components/selected-store-info.tsx`

## 受け入れ基準

- [ ] 320/375/430pxの全国表示で密集地域の店舗数が読める
- [ ] 768/1024/1440pxでもクラスターから地域・個別店舗へ移動可能
- [ ] 選択店舗のピンがヘッダー/一覧パネル/シートの裏へ隠れない
- [ ] 座標欠損店舗を誤った場所に表示しない

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/map-cluster-responsive.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #55。管理課題: #58。計画上のID: B06。作業ブランチ候補: `feat/map-cluster-and-region`。

## 撮影根拠

- location-mobile-full.png
- location-desktop-viewport.png
- location-320-full.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B07

## 確認した問題

公開版の多数の一覧カードで傾き・影・色付きテープが連続し、比較する文字の基準線が揃いにくい。ステッカーの雰囲気自体は維持したい。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

密度の高い一覧は回転0〜0.5度を設計目標として抑え、影を弱める。テープ・角丸・ブランドカラーを維持。ランキング上位など演出的なカードは別の役割として扱う。カードpaddingとgapは画面ごとの比較情報を基準に統一。

## 対象ファイル（実装時に所在を確認）

- `src/lib/sticker.ts`
- `src/components/character-list-card.tsx`
- `src/components/home/event-list-item.tsx`
- `src/components/events/event-grid-item.tsx`
- `src/components/ranking/ranking-row.tsx`

## 受け入れ基準

- [ ] 320/375/430pxで一覧の文字と操作の基準線が揃う
- [ ] 768/1024/1440pxでカードの傾きにより隣のカードへ重ならない
- [ ] hover/focusで重なりや切れがなく、押下対象を識別できる
- [ ] 変更前後を同じデータ・幅で撮影し、ブランドの雰囲気を確認

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/card-surface-layout.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #62、#60。管理課題: #58。計画上のID: B07。作業ブランチ候補: `refactor/card-surface-layout`。

## 撮影根拠

- characters-desktop-viewport.png
- ranking-desktop-viewport.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B08

## 確認した問題

公開版モバイルシートは条件変更後の表示件数と「閉じて結果を見る」操作がなく、下部にクリアボタンだけがある。モバイル一覧では適用中の条件も確認しにくい。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

実際に表示するactiveEvents.lengthで「N件を表示」ボタンをシート下部へ固定し、クリックで閉じる。条件変更は既存どおり即時反映、ボタンは保存処理ではない。クリアは副操作にする。モバイル/PCとも適用中条件の要約と件数を表示し、0件でも解除と条件変更ができる。

## 対象ファイル（実装時に所在を確認）

- `src/app/routes/events/index.tsx`
- `src/components/events/event-category-filter.tsx`
- `src/components/events/event-status-filter.tsx`
- `src/components/events/event-store-filter.tsx`

## 受け入れ基準

- [ ] 320/375/430pxで最後の条件と下部操作が隠れずスクロール可能
- [ ] 件数が実際のフィルター結果と一致し、ボタンでシートを閉じる
- [ ] 0件でも条件を変更・クリアできる
- [ ] 768/1024/1440pxのインラインフィルターでも同じ結果件数が分かる

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/event-filter-sheet-layout.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #50、#52、#60。管理課題: #58。計画上のID: B08。作業ブランチ候補: `feat/event-filter-result-action`。

## 撮影根拠

- events-filter-mobile.png
- events-grid-mobile.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## B09

## 確認した問題

公開版PC/モバイルの未選択画面は店舗セレクトと無効な探索ボタンのみで大きな空白があり、必要店舗数・順序・駅選択が説明されない。

2026-10-02、Playwright MCPで公開版 v0.35.4 (4dfd2d4) を撮影。ソースの最新変更とはデプロイ版が異なるため、実装時に再確認する。

## 対応方針

初期画面に「店舗を2〜5件選択」「利用駅を確認」「訪問順を計算」の手順を示す。無効な探索ボタンの近くへ不足条件を表示し、条件を満たすと説明を更新。PCはフォーム幅を制限して左側の空白を抑え、モバイルは縦順にする。AI参考値の説明はA05と一致させる。

## 対象ファイル（実装時に所在を確認）

- `src/app/routes/route/index.tsx`
- `src/components/route/store-select.tsx`
- `src/components/route/selected-store-list.tsx`

## 受け入れ基準

- [ ] 320/375/430pxで必要店舗数と次の操作が読める
- [ ] 768/1024/1440pxでも入力と説明が離れすぎず同じ領域で確認できる
- [ ] 0件/1件/駅未設定の無効理由を区別する
- [ ] 入力だけの確認ではAI呼出しを行わず、探索時の説明はA05と一致

## 検証計画

320/375/430pxのモバイル、768pxの境界、1024/1280/1440pxのデスクトップを対象に撮影・操作確認する。回帰テスト候補: `e2e/route-empty-state-layout.spec.ts`。現時点ではテスト未作成、修正未実装。

## 依存と管理

依存: #47、#48、#52。管理課題: #58。計画上のID: B09。作業ブランチ候補: `feat/route-onboarding`。

## 撮影根拠

- route-mobile-viewport.png
- route-desktop-viewport.png

追加撮影は8画面・26の画面幅組合せ、52画像。記録は作業ブランチの `docs/plans/2026-10-02-responsive-visual-review.md` に保存（現時点ではローカル未コミット）。認証後画面・ダークテーマ・実機タッチは今回の確認対象外。

## 既存課題への追加

A14 (#56): ホームの主要導線をヒーロー付近へ配置し、アクセスカウンターを補助情報として下げる。320〜1440pxで導線の発見性と長いイベント名を確認。

A10 (#52): 数字付き月選択の操作名・選択状態・キーボード操作はB03と合わせる。

A15 (#57): B01〜B09も回帰対象に含める。撮影成功は修正完了を意味しない。
