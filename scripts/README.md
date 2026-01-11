# Scripts

プロジェクトで使用する各種スクリプトの整理ディレクトリ

## ディレクトリ構成

### archive/
過去のデータファイルやアーカイブ用ファイル
- Biccameキャラクター・カレンダーデータのバックアップ
- 過去のイベントデータ修正用ファイル

### data/
外部データの取得・変換用スクリプト
- `fetch_biccame_calendar.py` - Biccameカレンダーデータの取得
- `fetch_biccame_profile.py` - Biccameプロフィールデータの取得
- `convert_zenkaku.py` - 全角文字の変換処理

### migration/
データベース・KVストアのマイグレーション関連スクリプト
- `migrate.ts` - 汎用マイグレーションスクリプト
- `migrate_votes_to_db.ts` - 投票データのKVからD1への移行
- `export_votes_from_kv.ts` - KVから投票データをエクスポート
- `reset.ts` - データベースのリセット処理

### utilities/
データメンテナンス・生成用ユーティリティ
- `add_biccame_musume_flag.ts` - Biccame娘フラグの追加
- `generate_biccame_quiz.ts` - Biccameクイズの生成
- `geocode_addresses.ts` - 住所のジオコーディング処理
- `merge_birthdays.py` - 誕生日データのマージ処理
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
