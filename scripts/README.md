# Scripts

プロジェクトで使用する各種スクリプトの整理ディレクトリ

## ディレクトリ構成

### utilities/
データメンテナンス・生成用ユーティリティ
- `generate_biccame_quiz.ts` - Biccameクイズの生成
- `geocode_addresses.ts` - 住所のジオコーディング処理
- `update_characters_prefecture.ts` - キャラクター都道府県情報の更新

- `update_characters_prefecture.ts` - キャラクターの都道府県情報の更新

## 実行方法

### TypeScript/Bunスクリプト
```bash
bun scripts/[category]/[script-name].ts
```

### Pythonスクリプト
```bash
python scripts/[category]/[script-name].py
```

## 注意事項
- マイグレーションスクリプトは本番環境で実行する前に必ずdev環境でテストすること
- データ取得スクリプトは外部APIの利用制限に注意すること
