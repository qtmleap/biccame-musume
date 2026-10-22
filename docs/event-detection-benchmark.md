# 旧raw判定層の診断（deprecated / historical）

主評価は `bun run benchmark:events` の実パイプラインです。236件のデータ・固定100件の98%/FP0という実績と制約は [`event-pipeline-benchmark.md`](event-pipeline-benchmark.md) を参照してください。この文書は投稿全文を直接判定した旧 `benchmark:events:raw` と旧5例 `benchmark:events:smoke` の診断用で、現在の主評価や追加実AI実行の承認ではありません。

旧raw scriptの既定directoryはv8の保存原本です。現行版ではversion/hash照合により拒否されるため、**bare `benchmark:events:raw` を主導線にせず、版・条件ごとの未使用 `--directory` を必ず明示**してください。v8のmanifest・応答・summaryは書換えません。

## 評価データと開発例を分離する

- **品質評価コーパス**: `scripts/data/event-detection-benchmark/{a,b}-*.json` の公開公式投稿。実投稿を原文から注釈し、過去AIの判定・回答を正解として流用していません。
- **スモーク/開発例**: `scripts/lib/event-detect/benchmark-cases.ts` の5例。これは100件評価の代わりではありません。
- 注釈は `reviewStatus: provisional`。人間レビュー済みの確定正解ではありません。各例の `rationale` とタグを確認できます。
- `expected.isEvent` と物品の `category` は別です。category/stores/characterIds/startDate/conditionsの未注釈はnull、原文で確認できた「なし」は空配列として区別します。
- ギフトカードは `other`、入金条件は `charge`。入金を購入金額へ流用しません。

本文のNFKC/空白正規化hashと投稿IDで重複除外し、同一campaign groupから1件だけ選びます。調整に使った3投稿とその企画の兄弟投稿、対象範囲が未確定の境界2投稿（2111633864368210298/2110626732063805924）をstrict holdoutから除外します。固定seedで100件以上を選択します。件数を増やすための合成・単純な言い換えは品質評価へ入れません。

## 外部通信なしの検証

```sh
bun run benchmark:events:raw --directory .wrangler/benchmarks/raw-current-diagnostic
bun test __tests__/event-detection-benchmark.test.ts __tests__/event-benchmark-corpus.test.ts
```

manifestは件数・陽性/陰性分布・注釈の分母・除外理由を表示します。モデル予測や正解率は生成しません。unitは注入応答だけを使用します。陰性が多いコーパスなので、単純accuracyに加えてmajority-class baselineとbalanced accuracy、陽性recallを確認してください。

## 旧100件raw実AI評価の記録

以下は旧raw評価の動作仕様です。現在は追加AI未承認のため、再実行しません。過去の `--live --limit 100 --max-calls 200 --concurrency 2` は投稿全文を直接判定する旧診断の引数であり、実パイプライン主評価の引数ではありません。旧 `.wrangler/benchmarks/holdout-v8-100-r2-strict` を現行版の出力先に流用してはいけません。将来別途承認された診断でも、新しい版・入力・設定の専用directoryが必要です。

既存ローカル評価APIを使う場合もサーバーは起動・停止しません。生予測の再採点や旧summaryの上書きを主評価の改善として扱いません。

- 各caseを現行モデルへ2バッチ、100件なら最大200回。再試行0、並列は最大2、リクエストごとの期限と全体期限を設定します。
- `manifest.json` が入力・ラベル・版・seed・選定provenanceを固定。以降datasetが増えても同じdirectoryは固定集合からresumeします。違う版/条件では再利用しません。旧manifestに独立候補数や除外記録がなければnull/legacy-unrecordedと表示し、現在のraw件数で代用しません。
- 再利用前に保存requestsの本文・質問・選択肢・モデルと現行版の生成入力をhash照合します。不一致は再送も再採点もせず拒否します。case IDは安全なslugだけを受け付けます。
- `*.attempt.json` に送信試行数を保存し、caseごとに入力・応答・採点を保存。完了済みは再送しません。中断途中のattemptも勝手に再試行せずエラーに数えます。
- Ctrl-C/終了後も既存サーバーを停止しません。未完了ケースだけ再開し、過去attempt数を予算に加算します。
- 失敗・保留を全体の分母から除きません。`summary.json` にモデルのTP/FP/FN/TN、precision/recall、abstain/coverage、balanced accuracy、最終register/held/ignored、注釈field別・タグ別の分母を保存します。
- event predictionは既定eventThreshold/ignoreThresholdを使用。物品など別項目で最終保留でも、モデルのイベント回答と最終パイプライン状態は別に示します。
- historical-baselineは既存D1をread-onlyで読みます。古い版・抽出範囲・閾値が混在するため、100件の旧新版の対照実験と偽りません。
- `.wrangler/benchmarks/` はgitignored、権限を制限。秘密ヘッダーやtoken、非公開利用者情報は保存しません。本番DB/既存イベント/受信履歴/通知は更新しません。

ケース数100は全項目の注釈数100を意味しません。特に入金条件・複数対象の独立例が少ない場合、そのfieldの一般精度は主張できません。母集団や期間の偏り、暫定group/labelの不確かさを併記します。

この実測は保存した投稿本文をClefの2バッチへ直接渡す判定層の評価です。抽出用LLMを100件再実行したend-to-end評価ではありません。複数物品を別候補に抽出する品質や、画像だけの根拠は別途評価が必要です。API呼出回数は記録しますが、provider内部のキャッシュ有無や実課金額は検証していません。

## 監査修復の評価版

初回v8-r1（`.wrangler/benchmarks/holdout-v8-100`）には、対象範囲が未確定の動画投稿1件が残っていました。原manifest・hash・応答・集計は保持し、この1件をboundary別枠へ移しました。

strict v8-r2は、原99件の入力/model/hashを照合してそのまま再利用し、同期間の未使用・非開発・非境界・別groupの1件だけを固定seedで補完しています。追加実AIはその1件の2バッチだけです。陽性/陰性の割合と分母の変更を明示し、数値変動をプロンプト改善とは呼びません。r1とr2を混ぜて集計しないでください。

## 開発用1投稿の比較とオフライン再生

```sh
bun run benchmark:events:smoke --case yuurakuchou-limited-gift-card \
  --baseline-db .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<local-db>.sqlite \
  --save-baseline .wrangler/benchmarks/baseline.json
bun run benchmark:events:smoke --live --case yuurakuchou-limited-gift-card \
  --baseline-json .wrangler/benchmarks/baseline.json
```

この旧2+新2バッチの比較は最大4回です。過去結果は上書きしません。5例の合成対照と調整に使った実例は開発用であり、品質評価holdoutへ混ぜません。

```sh
bun --no-env-file scripts/replay-event-benchmark.ts \
  --input .wrangler/benchmarks/<live-comparison>.json \
  --baseline-json .wrangler/benchmarks/baseline.json \
  --out .wrangler/benchmarks/replay.json
```

保存応答を現行ルールで再評価する操作はAIを呼びません。保留時のfield観測は下書きなら `observationSource: draft` と明示し、正しい下書きがあることと自動登録成功を混同しません。1例の改善だけでモデル全体の品質向上とは判断しません。
