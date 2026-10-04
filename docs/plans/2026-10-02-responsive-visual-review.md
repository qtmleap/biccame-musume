# デスクトップ・モバイルの追加視覚レビュー

2026-10-02。Playwright MCPのローカルサーバー経由で公開版 https://biccame-musume.com を撮影。表示バージョンは v0.35.4 (4dfd2d4)。ソースのレビュー対象とデプロイ版は異なるため、修正時は最新ビルドで再確認する。

## 確認範囲

初回は8画面を375/1280pxで確認。追加は320/430/768/1024/1440px、8画面・26組合せ、各viewport/fullの52画像。各幅ですべての画面を確認したわけではない。

| 幅 | 追加確認した画面 |
|---|---|
| 320 | ホーム、キャラクター一覧、イベント、カレンダー、詳細、地図 |
| 430 | キャラクター一覧、イベント、カレンダー、詳細 |
| 768 | ホーム、キャラクター一覧、イベント、カレンダー |
| 1024 | キャラクター一覧、イベント、詳細、ランキング |
| 1440 | 上記8画面（ホーム・一覧・イベント・カレンダー・詳細・地図・ランキング・経路） |

26組合せすべてでdocument.documentElement.scrollWidthはviewport幅と一致し、ページ全体の横はみ出しは検出されなかった。日程表内部の横スクロールや地図SDKの画面外要素は別扱い。

## 再現した問題と改善提案

- 320px: カレンダーの店舗名が共通接頭辞「ビックカメラ…」で省略され、店舗を識別しにくい。ホームの長いイベント名も1行省略。B01/B03。
- 430px: カレンダーの月選択は12個の点で、月番号が見えない。B03。
- 768px: 数字付き月選択の両端が切れる。追加DOM確認でスクロール領域clientWidth704px、scrollWidth731px、scrollLeft0。1月ボタンのx約4.8pxに対して領域左端は約32pxで、領域内でクリップする。B03。
- PC/モバイル共通: 日程表の高彩度の帯と小さい文字、密集地域の地図ピンの重なり。B02/B06。
- キャラクター一覧に店舗・地域の識別情報と名前検索を追加する設計提案。B04。
- 詳細画面の画像サイズと情報区分、一覧カードの影・傾き・余白を整理する視覚設計提案。B05/B07。
- フィルターシートの結果件数・完了操作、経路の初期操作説明を追加する提案。B08/B09。
- ホームの主要導線とアクセスカウンターの配置は既存A14 (#56)に追加する。

文字測定の一例: 白カードの12px補足文字は約4.83:1、ピンク背景の14px補足リンクは約4.11:1。全ての灰色文字が不適合という判断ではない。変更後は両テーマで実測する。

## 保存した証拠

代表12画像と26組合せのDOM測定結果を保存。全52画像は撮影時の /tmp/biccame-visual-review-additional にある。

- [home-320-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/home-320-viewport.png)
- [characters-320-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/characters-320-viewport.png)
- [events-320-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/events-320-viewport.png)
- [events-1440-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/events-1440-viewport.png)
- [calendar-320-full.png](../reviews/2026-10-02-ui-ux/screenshots/calendar-320-full.png)
- [calendar-430-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/calendar-430-viewport.png)
- [calendar-768-full.png](../reviews/2026-10-02-ui-ux/screenshots/calendar-768-full.png)
- [calendar-1440-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/calendar-1440-viewport.png)
- [characters-abeno-1024-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/characters-abeno-1024-viewport.png)
- [location-1440-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/location-1440-viewport.png)
- [ranking-1440-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/ranking-1440-viewport.png)
- [route-1440-viewport.png](../reviews/2026-10-02-ui-ux/screenshots/route-1440-viewport.png)

[DOM測定結果](../reviews/2026-10-02-ui-ux/measurements.json)。

認証後画面、ダークテーマ、実機タッチ、スクリーンリーダー、修正後の回帰テストは未確認。撮影・閲覧のみ実施し、本番投票やAI経路計算は実行していない。
