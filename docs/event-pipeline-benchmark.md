# 実パイプラインの評価

> 登録の精度の主評価は D1 の人手修正済みイベントを正解とする Golden に移った（[event-detection-golden.md](./event-detection-golden.md)）。この文書の本文からの暫定注釈のコーパスは主評価ではない。

`bun run benchmark:events` は実パイプラインの主評価です。既定はofflineで入力集合だけを確認し、AI呼出は0回です。投稿全文を直接判定する旧診断は `benchmark:events:raw`（deprecated/historical）、旧5例は `benchmark:events:smoke` に分離しています。旧raw診断は抽出前停止・複数物品・必須情報を再現せず、その結果を実アプリの検出率や登録率とは呼びません。

## 段階

この評価は同じ原投稿について、件数質問、抽出、件数監査、物品別の根拠・参考文脈、判定バッチ、発見根拠、登録可否をそれぞれ記録します。旧基準は編集前のソースと依存を凍結したbundle、新版も凍結bundleを使います。

```sh
bun run benchmark:events
bun run benchmark:events --size 200 --directory .wrangler/benchmarks/goal-pipeline/offline-200
```

既定は外部通信なしです。新たな236件（陽性118・陰性118）の公開公式投稿から、月×公式アカウントのペアを保った200件（各100）を構成します。既定の `--size 100` は各50件です。ラベルは本文からの暫定注釈で、人間の正解承認済みとは扱いません。既存A〜Fと診断12例は `--dataset legacy` で別に扱います。

`expected`・`stageGold`・`observedD1` は採点専用です。モデル入力へのprojectionは公開原投稿の既知fieldだけを取り出し、これらの注釈や事前計算された抽出文脈を渡しません。sentinelを注入した回帰テストで、件数質問・抽出・物品判定の全入力に正解が混入しないことを検証します。

```sh
bun run benchmark:events --size 200 --directory .wrangler/benchmarks/goal-pipeline/offline-200 --d1 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/62a34a811f0a7cc8f5790988a0da51e6e1467bf09e73ceef9a5576fb0d4ed81d.sqlite
```

D1はread-only。旧version・抽出・子候補・手動連携状態は参考情報として別に保存し、モデルの正解ラベルに流用しません。本文だけでなく媒体・引用・投稿日も照合し、入力差を明示します。

## 新イベント判定200ケース（expanded-v2）

追加した別datasetです。公開公式投稿から選んだ**200件（陽100・陰100）**で、月×公式アカウントごとに陽陰が同数です。ラベルは本文からの暫定注釈で、人間の正解承認済みではありません。既存のA〜F350件＋goal236件（計586件）、前回の固定100件、旧98%の原本は一切変更せず、自動で統合もしません。

- **前回の98%には含めません。** 98%は固定100件（`annotated-goal-v1`）だけの結果です。新200件は別のdataset revision（`annotated-expanded-v2`）で、今回の新規AI呼出は**0回**です。実AIの結果はまだ無く、新しい成績として扱いません。
- 既存586件との重複は、投稿ID・正規化本文・企画group・ケースIDで0、文字3-gramのJaccard 0.9以上の近似重複も新旧・新同士で0です。陰性は陽性と同じ月×アカウントの、一般商品・別IP・店舗案内・日常の投稿で、ビッカメ娘固有の入手物・展示・参加企画を告知していないものです。
- 新ケースIDは `expanded-v2-positive-<投稿ID>` / `expanded-v2-negative-<投稿ID>`。`stageGold`・`observedD1` は旧goalと同じスキーマで、未確定項目は `unannotatedFields` に残し、誤りとは断定しません。D1観測は診断専用で正解にもモデル入力にもしません。なお検証が要求する「`observedD1.job`はnull・`candidates`は空」「`expected.status`は未注釈」は、**今回の200件に対するデータ方針**であって一般的な安全規則ではありません(今回の200件にD1の直接一致は0件、参照URL一致のみ5件)。将来、診断として正しく一致した別datasetを排除する規則にはしません。`ready` は全項目が原文で確定できた陽性だけで、登録準備の品質はこのsetの主指標にしません。
- 出典は `provenance.json` に記録します。archive別件数、各投稿のarchive行番号・投稿全体のhash・本文hash、注釈のdigest、旧コーパス件数（586）です。CIは巨大な原archiveやローカルD1を読まず、この小さなprovenanceと旧コーパス、各行の根拠一致（`evidence` が本文に完全一致するか）、月×アカウントの対応、digest再計算だけで検証します。

```sh
# offline・AI呼出0。件数を指定しなければ揃う組を全て使う(200件)。
bun run benchmark:events --dataset expanded

# 全ての検証結果を列挙するだけの監査(問題があればexit 1)
bun --no-env-file scripts/audit-expanded-corpus.ts
```

datasetごとに凍結cohortの既定directory・seed・承認ファイルを分けています。

| dataset | 既定directory | 既定seed | 既定の承認ファイル |
| --- | --- | --- | --- |
| goal（既定） | `.wrangler/benchmarks/goal-pipeline/phase1` | `goal-pipeline-v1` | `goal-integration-safety-gate.json` |
| expanded | `.wrangler/benchmarks/goal-pipeline/expanded-v2` | `expanded-v2-pipeline-v1` | `expanded-v2-safety-gate.json` |

- 凍結済みcohortは、dataset名・全ケースのid+hash・件数・選定した組と陽陰の対応・凍結時のdigestが現行コーパスと一致する場合だけ再利用します。旧goal100のdirectoryを `--dataset expanded` に渡す、旧cohortの `dataset` ラベルだけを書き換える、といった流用は最初の通信前に拒否します。
- 既存の承認は特定のケースhash（cohort全件のhash）に束縛されているため、旧goal100の承認は新datasetを承認しません。承認が無い／不一致の `--live` は、モデルへ送る前に拒否します。承認を緩めず、本書の記録は追加AI実行の承認ではありません。
- 既定の `--dataset goal`（100件・各50）の選定と `caseHash`（`12bc2dc0...`）は変えていません。旧A〜Fは従来どおり `--dataset legacy` です。

## 実AI

新旧bundle・入力集合・observer・runtime profile・adapter/schemaの正確なhashについて、独立安全レビューの承認JSONが必要です。未承認・不一致は最初のAI送信前に拒否します。既存ローカル評価APIだけを使い、秘密ファイルや認証ヘッダーをCLIへ読み出しません。サーバーを起動・停止・再起動しません。

今回の実測は完了しており、**追加AI・実job再判定・remote書込・SNS公開は未承認**です。実行済みcommandは `.wrangler/production-sync/goal-live-executor-result.json` の `recordedExecution` に保存しています。承認は `.wrangler/production-sync/goal-quality-live-approval.json`、事後判断は `goal-quality-post-gate.json` です。過去の `goal-integration-safety-gate.json` はrejectedの歴史として残し、新しい評価の承認に流用しません。

抽出は固定Haikuのローカル中継、判定は既存Clef中継を使います。旧版の抽出がツール未呼び出しを再試行したり、件数不一致で再抽出する場合は、それも実ソース由来の挙動として予算へ数えます。通信失敗の再試行はしません。各armは並列2以下、期限・総呼出予算・排他lock・送信前checkpointを使います。中断や失敗は再送せず、未完・エラーを分母から消しません。

## 採点

- `rawModel`・`productionPolicy`・`operatorVisible`・`operatorRelationConfirmed` を別表にし、可視候補率と確定関連性を混同しません。
- 共通operator観測器は新旧どちらにも同じ規則を使います。低.9のheldでも、具体的下書き／原文に支持された保存item・見える回答・利用できる確認や連携操作があれば、旧版へも同じ可視候補点を与えます。
- 旧ignoredのDTOは下書きnullですが、保存item・原回答は表示され、先行実装で既存への連携も可能です。observerはignoredの計算上の下書きを信用せず、実際に見えるitemと回答だけを使います。itemも無い内部情報を加点しません。
- `operatorVisible` は具体情報を人が確認できる候補の可視性です。relatednessが確定したモデル成績や自動登録率ではありません。これだけの増加でgoal達成と宣言しません。
- 同じ凍結proof readerで両側の関係根拠を照合しますが、その診断をproductionが実際に出力した判断と混ぜません。新版flagだけで共通observerの観測結果が変わらないことを対照テストします。
- モデルのみ、根拠ルールのみ、前段停止、発見action、登録準備済みも別に集計します。
- 条件や対象娘を記載なしから補完せず、根拠なしの全員配布・開催店の娘への置換を行いません。
- 抽出検証の失敗はpipelineの取りこぼしとして残します。通信・実行基盤エラーがある比較は改善根拠にしません。
- 登録準備済みは件数監査matchedかつ物品候補のみ。企画文脈だけの候補や監査不一致から自動登録へ進めません。

実測前の達成目安は同一ケースでrecallが20ポイント以上改善し、FPが増えず、新版の検証エラー0、陽性のpaired gainがlossを上回りexact検定p<.05であることです。暫定ラベルと標本範囲の限界は別に説明します。

元投稿・新旧各段階の入出力・入力hash・エラー・件数・版・予算を `.wrangler/benchmarks/goal-pipeline/` へ保持します。実D1イベント・既存Webhook判定・通知・本番DBは変更しません。

## 固定100件の完了実績

236件から同じ月×公式アカウントの50ペア（陽50・陰50）を固定し、両armへ同じruntime snapshotを適用しました。Clef/Haiku 5.5、event/choice .9、ignore .5、status .8、category .85、他field .9です。過去のcategory .9既定値でのraw評価とは別実験です。注釈は独立LLMによる暫定値であり、人間の確定goldや母集団の保証ではありません。

| 主指標（凍結scorer） | 旧版 | 新版 |
| --- | ---: | ---: |
| TP / FP | 0 / 0 | 49 / 0 |
| hard FN / TN | 0 / 12 | 0 / 47 |
| 陽性保留 / 陰性保留 | 50 / 38 | 1 / 3 |
| positive misses | 50 | 1 |
| effective recall | 0% | 98% |
| 自動登録ready | 0 | 0 |

陽性recallは+98ポイント、paired gain49/loss0、両側p=3.55e-15、両armのerror0です。旧200＋新432＝632回、限定2例の通信確認18回を含むphaseは**650/1200回**でした。件数200・抽出200・物品判定232の主評価台帳と送信前checkpointを保存しています。

- 旧版は陽性50件すべて件数監査で停止し、関連性判定は0/100件、raw model指標はN=0（未実施100）です。新版は100件へ到達しました。これは実パイプラインの到達・関連性policyの改善で、旧モデルが陽性50件を否定した、モデル能力が向上したとは説明しません。
- native policyの別集計は新版TN49・陽性uncertain1・陰性uncertain1です。凍結scorerはnative ignoredの陰性2件も保守的にreviewへ置くため、原表はTN47・陰性review3です。TP49/FP0/採用判断は同じで、原予測・集計は書換えていません。
- operator可視情報は旧0陽/0陰→新49陽/3陰です。陰性3件は確認負荷であり分類FPではありません。共通支持根拠は新48陽/0陰。policyの49件と可視情報の49件は同一集合ではありません。
- 登録readyは両armとも0で、登録品質の改善は未証明です。ignored後の `missingFields: []` は必須情報確認済みではなく、厳格な登録判定へ未到達の意味です。原文にない条件・娘・日付は補完しません。

独立postgateは全49TPの原文・116物品判定のspan・432実応答再生・650回の台帳を確認し、この固定集合での関連性改善と厳格登録guard付き統合採用を承認しました。実アプリの一時DB入口2例も71assertで候補/DTO保持・event/outbox/外部通知0を確認しています。これはデプロイ、実job再判定や公開範囲拡大の承認ではありません。

保存証跡（gitignored、同じ作業環境のみ）:

- `.wrangler/production-sync/goal-live-executor-result.json`: 最終結果、実行済みcommand、offline再現command。
- `.wrangler/production-sync/goal-quality-post-gate.json`: 正式事後承認と残制約。
- `.wrangler/benchmarks/goal-pipeline/phase1/comparison.json`: 原比較。旧 `primaryMetricScope` の文言とraw unavailable=0は古いため、事後レビューのproduction-policy/raw到達別表を使います。
- `.wrangler/benchmarks/goal-pipeline/phase1/post-live-analysis.json` と `gain-artifacts/`: 別集計と全49件の実根拠。原本は保全しています。
- `.wrangler/benchmarks/goal-pipeline/phase-live-attempts.jsonl`: 主評価632試行の台帳（限定通信18回は別記録）。

判定器を呼ばない再現検証:

```sh
bun run benchmark:events
bun test __tests__/goal-real-gain-replay.test.ts __tests__/goal-profile-parity.test.ts __tests__/goal-operator-observer.test.ts
```
