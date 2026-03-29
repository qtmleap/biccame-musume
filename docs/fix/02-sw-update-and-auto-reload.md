# 修正計画書 #2: SW 更新通知・自動リロード機構の実装

## 問題の概要

1. 新しいバージョンがデプロイされた時に、ユーザーが能動的にアップデートする仕組みがない
2. 新しいバージョンがデプロイされた時に、自動的にアップデートされない

## 根本原因の分析

### 現状の実装

`src/app/main.tsx` で Service Worker を登録しているが、更新検知時のハンドラが `console.log` のみ:

```typescript
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New content available, please refresh.')  // ← ログ出力のみ
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
  // ...
})
```

`registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` が設定されているため、**新しい SW は即座にアクティブになる**。しかし:

- **新しい SW がアクティブになっても、既に読み込まれたページは古い HTML/JS のまま**
- `onNeedRefresh` でページをリロードしていないため、ユーザーは手動リロードするまで古いバージョンを使い続ける
- `checkVersionAndClearCache()` はページ読み込み時にのみ実行されるが、SW が更新されても現在のページの JS バンドルは古いバージョンの値を保持しているため、次回リロードまでバージョンチェックが効かない

### 問題の本質

`autoUpdate` は「SW の更新を自動化」するが「ページの更新を自動化」するわけではない。SW がアクティブになっても、ブラウザタブ内の古い HTML/JS は入れ替わらない。ページをリロードして初めて新しいアセットが読み込まれる。

---

## 対応方法の比較

### 方法A: 自動リロード（推奨）

新しい SW が制御を取得した時点で自動的にページをリロードする。

**実装:**

`src/app/main.tsx` を修正:

```typescript
// SW の controller 変更を検知して自動リロード
let refreshing = false
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return
  refreshing = true
  window.location.reload()
})
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約10分 |
| 金額コスト | $0 |
| リスク | 低。ユーザーが入力中にリロードされる可能性があるが、このアプリはフォーム入力が少ないため影響は限定的 |
| UX | リロード前に短いトースト通知を出すことで体験を改善可能 |
| 効果 | デプロイ直後にユーザーのページが自動更新される |

### 方法B: トースト通知 + 手動更新ボタン

更新が検知されたらトースト通知を表示し、ユーザーがボタンを押してリロードする。

**実装:**

```typescript
import { toast } from 'sonner'

registerSW({
  immediate: true,
  onNeedRefresh() {
    toast('新しいバージョンが利用可能です', {
      action: {
        label: '更新する',
        onClick: () => window.location.reload()
      },
      duration: Infinity  // 手動で閉じるまで表示
    })
  },
})
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約15分 |
| 金額コスト | $0 |
| リスク | 低。ユーザーが更新ボタンを無視する可能性がある |
| UX | ユーザーに選択権がある。ただし通知を無視されると古いバージョンのまま |
| 効果 | 更新があることをユーザーに通知し、能動的なアップデートを可能にする |

### 方法C: 方法A + 方法B のハイブリッド（最推奨）

トースト通知を表示しつつ、一定時間後に自動リロードする。

**実装:**

```typescript
import { toast } from 'sonner'

let refreshing = false
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (refreshing) return
  refreshing = true
  window.location.reload()
})

registerSW({
  immediate: true,
  onNeedRefresh() {
    toast('新しいバージョンに更新します...', {
      description: '数秒後に自動的にページが更新されます',
      duration: 3000
    })
  },
})
```

加えて、**定期的な SW 更新チェック**を追加:

```typescript
onRegistered(registration) {
  if (registration) {
    // 60分ごとに SW の更新をチェック
    setInterval(() => {
      registration.update()
    }, 60 * 60 * 1000)
  }
}
```

| 項目 | 内容 |
|------|------|
| 実装コスト | 約20分 |
| 金額コスト | $0 |
| リスク | 低。通知→自動リロードの流れでユーザーに心理的準備を与える |
| UX | 最も良い。通知で認知させ、自動リロードで確実に更新 |
| 効果 | デプロイ直後 + 定期チェックで確実にユーザーに最新版を届けられる |

---

## 推奨対応

**方法C（ハイブリッド）** を推奨する。

理由:
- 自動リロードだけだと「突然ページが切り替わった」とユーザーが混乱する
- トースト通知だけだとユーザーが無視する可能性がある
- 通知で「まもなく更新されます」と伝えてから自動リロードすることで UX と確実性を両立

**合計実装コスト: 約20分、金額コスト: $0**

## 実装手順

1. `src/app/main.tsx` の `registerSW` コールバックを修正
   - `onNeedRefresh` でトースト通知を表示
   - `controllerchange` イベントで自動リロード
   - `onRegistered` で定期的な更新チェック（60分間隔）を追加
2. トースト通知のスタイル調整（既存の Sonner コンポーネントを使用）
3. ビルド & 動作確認（SW 更新シナリオのテスト）
