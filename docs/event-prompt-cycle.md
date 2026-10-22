# イベント判定プロンプトの改善サイクル

目的はFalse Negative（対象イベントの取りこぼし）を減らし、False Positiveを増やさないことです。True Negativeは正しく対象外と判断した結果であり、削減対象ではありません。

## データ分離

- 既存のv8厳密100件は開発集合です。保存済み応答を使ってv8の基準値を再生できます。
- 作者が調整中に参照していない新規E群50陽性と、期間を揃えた新規F群50陰性を最終100件として固定します。既に会話へ例が露出したC群は最終の盲検評価へ使いません。
- 最終集合の本文・正解・個別応答をプロンプト修正中に参照しません。候補を凍結した後に一度だけ比較します。
- 注釈は暫定であり、人間レビュー済みの正解とは主張しません。

## 判定器の固定

実行時の可変ソースを過去版として使わないよう、`createDetectionRequests`・`evaluateDetection`・下書き・スキーマ・内部依存を同じbundleへ保存します。SHA256と外部依存の版を隣接metadataへ記録します。

```sh
bun build .wrangler/benchmarks/prompt-cycle/baseline-entry.ts \
  --target=bun --external zod --external dayjs --external 'dayjs/*' \
  --outfile .wrangler/benchmarks/prompt-cycle/candidate-round1.mjs
```

`baseline-entry.ts` は公開関数を再exportする生成時入口です。基準版bundleは変更せず、新候補には新しいファイルを使います。

## 外部通信なしの確認

```sh
bun --no-env-file scripts/run-event-prompt-cycle.ts \
  --evaluator .wrangler/benchmarks/prompt-cycle/baseline-v8.mjs \
  --manifest .wrangler/benchmarks/holdout-v8-100-r2-strict/manifest.json \
  --arm dev-baseline
```

保存済み基準応答の再生は`--reuse`を明示します。AIを呼ぶrunnerは無効です。

```sh
bun --no-env-file scripts/run-event-prompt-cycle.ts \
  --evaluator .wrangler/benchmarks/prompt-cycle/baseline-v8.mjs \
  --manifest .wrangler/benchmarks/holdout-v8-100-r2-strict/manifest.json \
  --arm dev-baseline \
  --reuse .wrangler/benchmarks/holdout-v8-100-r2-strict
```

## 明示的な実AI評価

```sh
bun --no-env-file scripts/run-event-prompt-cycle.ts \
  --evaluator .wrangler/benchmarks/prompt-cycle/candidate-round1.mjs \
  --manifest .wrangler/benchmarks/holdout-v8-100-r2-strict/manifest.json \
  --arm dev-round1 --live --max-calls 800 --concurrency 2
```

- 既存のローカル管理AI評価APIだけを使い、サーバーを起動・停止しません。
- 全arm共通の`calls/`台帳で最大800呼び出し。並列は最大2、自動再試行はありません。
- 呼び出し前に台帳とattemptを保存します。中断attemptを再送しません。
- 既存のcase結果は入力hash・判定器hash・manifestを確認して再生します。
- 同じarmの入力や判定器が変わった場合は拒否し、別armを作る必要があります。
- 同時に複数armを起動しないよう、実行中は`active.lock`で排他します。強制終了後のlockは、実行プロセスと台帳を確認せず削除しないでください。
- 本番DB、既存Webhook履歴、イベント登録、SNS通知は変更しません。

## 採用基準と報告

開発集合でrecallが改善し、観測FPが基準版より増えない候補を独立レビューへ回します。最大2候補を評価し、最良候補を固定してから未使用100件を基準版と対にして実行します。改善しない場合は無理に採用しません。

誤り・保留を分母から外しません。TP/FP/FN、precision/recall、coverage/abstain、物品など各fieldの注釈分母、最終statusと理由を別々に報告します。最終集合の結果を見て同じ集合へ再調整した場合、それを未使用holdoutの性能とは呼びません。

## 今回の版別結果（同一開発100件）

陽性11件・陰性89件、event threshold .9、ignore threshold .5を固定しました。hard FNは明確な陰性判定で、陽性保留とは分けます。旧集計の`fn`は保留込みの`positiveMisses`という意味のまま保持し、既存の数値を変更していません。

| Version | TP | FP | hard FN | TN | 陽性保留 | 陰性保留 | positiveMisses（旧fn） | effective recall |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| v8-object-kind | 5 | 0 | 2 | 87 | 4 | 2 | 6 | 45.45% |
| v9-topic-lifecycle | 5 | 0 | 0 | 89 | 6 | 0 | 6 | 45.45% |
| v10-operation-updates | 5 | 0 | 0 | 88 | 6 | 1 | 6 | 45.45% |

v9/v10は明確な陰性判定を保留へ移しましたが、確定陽性のrecallは改善せず、両候補は不採用です。実呼出はround1/round2各200、計400。未使用E/F最終100件は送信せず温存しました。元判定・モデル応答・入力・D1実データは変更していません。

完全な版名とCSVは `.wrangler/benchmarks/prompt-cycle/evaluator-version-table-final.md` / `.csv` に記録しています。`scripts/compare-event-prompt-cycle.ts` は比較JSONを新規生成する際に、同じ出力名の`.md`・`.csv`も生成します。表は保存済み応答から再計算し、新たなAIを呼びません。各版更新時に同じ定義の表を出し、hard FNの減少と保留への移動を混同しないようにします。
