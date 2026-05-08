# Work Plan: アップデート画面の公式透過画像化

Date: 2026-04-11

## Goal

`UpdateOverlay` に公式配布の透過キャラクター画像（`https://stampcamera.com/packages/53/package.zip`）を表示する。第三者配布は避けたいため R2 等には置かず、Cloudflare Worker を CORS プロキシ（fetch-through、キャッシュなし）として使ってブラウザから取得し、展開結果をクライアント側 Cache API に保存する方式を採る。

## Context / Constraints

- ZIP サイズ: 約 **22 MB** (`content-length: 23128286`)
- CORS: `Access-Control-Allow-Origin` 無し → 直接 fetch 不可
- 第三者配布 NG → Worker はストレージを持たず、エッジキャッシュも無効化 (`Cache-Control: no-store`)
- 初回ダウンロードが重いので、アプリのアイドル時プリフェッチ + Cache API / IndexedDB による永続キャッシュが必須
- 展開には軽量ライブラリ `fflate`（約 10 KB、同期 API 有り）を採用

## Tasks

### backend (Worker)
- [ ] `src/api/assets.ts` を新設し、`GET /api/assets/characters-package` を実装
  - `fetch('https://stampcamera.com/packages/53/package.zip')` を実行
  - ステータス・`content-type: application/zip` を維持してそのままストリームで返す
  - レスポンスに以下のヘッダを付与:
    - `Cache-Control: no-store` （CF エッジに残さない）
    - `Access-Control-Allow-Origin: *`（もしくは自ドメイン）
  - upstream が 200 以外を返した場合は 502 で返す
- [ ] `src/index.ts` に `/api/assets` ルートを登録

### frontend
- [ ] `fflate` を `bun add fflate` で追加
- [ ] `src/lib/character-package.ts` を新設し、以下を実装:
  - `loadCharacterPackage(): Promise<Map<string, Blob>>`
  - 初回: Worker 経由で ZIP を fetch → `fflate.unzipSync` で展開 → 各 PNG を Blob 化 → Cache API (`caches.open('character-package-v1')`) に個別 Response として保存
  - 2 回目以降: Cache API から読み出し
  - バージョニング: パッケージの ETag or last-modified を key に含め、変更検出時に古いキャッシュを破棄
- [ ] `src/hooks/use-character-package.ts` を新設し、TanStack Query で `loadCharacterPackage` をラップ
  - staleTime: 24h、gcTime: 7 days、retry: 1
- [ ] `src/app/main.tsx` でアプリ起動後にアイドル時プリフェッチ（`requestIdleCallback` で `queryClient.prefetchQuery`）
- [ ] `src/components/pwa/update-overlay.tsx` を改修:
  - 既存の `useCharacters` → `characters.json` の URL 生成ロジックを置き換え
  - `loadCharacterPackage` から取得した Blob URL を `slots[].imageUrl` に流し込む
  - パッケージ未ロード時のフォールバックとして既存の URL を維持
- [ ] ZIP 内のファイル名と `character.id` の対応確認
  - 命名が一致しなければ `src/locales/character-package-map.ts` に mapping を追加

### qa
- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check src/`
- [ ] 手動動作確認:
  - dev で overlay を開き、透過画像が表示されることを確認
  - 2 回目に Cache API から即時表示されることを確認
  - Network タブで ZIP が `no-store` で返っていることを確認

## Execution Order

1. Sequential: backend の Worker プロキシ → 手動で curl 動作確認
2. Sequential: `fflate` 追加 → `character-package.ts` → `use-character-package.ts`
3. Sequential: ファイル名マッピング確認（必要なら mapping 追加）
4. Sequential: `update-overlay.tsx` 改修 → `main.tsx` プリフェッチ
5. qa

## Deliverables

- `src/api/assets.ts` — CORS プロキシ endpoint
- `src/lib/character-package.ts` — ZIP 展開 + Cache API 永続化
- `src/hooks/use-character-package.ts` — TanStack Query ラッパー
- `src/components/pwa/update-overlay.tsx` — 表示ロジック差し替え
- `src/app/main.tsx` — アイドル時プリフェッチ追加
- (必要時) `src/locales/character-package-map.ts` — id ↔ ファイル名 mapping

## Risks / Notes

- **22 MB は重い**。モバイル回線で overlay 初見時にダウンロードが始まると UX が悪いので、プリフェッチ必須。通信量節約設定（`navigator.connection.saveData`）を尊重してスキップする配慮も入れたい。
- **Worker の CPU 時間**: プロキシは stream 方式で実装すれば CPU 負荷はほぼゼロ。`fetch().then(res => new Response(res.body, ...))` で済む。
- **キャッシュ無効化**: upstream の ZIP が更新されたら全クライアントのキャッシュを破棄したい。ETag をクエリに含める or 手動 bump できるよう version 変数を持たせる。
- **第三者配布の境界**: Worker が stream pass-through するだけなら「取得代理」に近いが、厳密には自ドメインからバイナリが流れることになる。ポリシー上問題にならないか最終判断は要確認。
- **ZIP ファイル名と id の対応が未確認** — 実装前に一度ローカルで `unzip -l` して調査する必要あり。
