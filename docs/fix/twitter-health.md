# 毎朝のX連携監視

productionの既存Cron `0 0 * * *` は毎日JST09:00に実行する。開始・終了イベントが0件でも、投稿前にX連携を読み取りで検査する。検査失敗時は両方の投稿を停止し、Discordに通知する。バッジ評価は独立して継続する。通知失敗・未設定はログに記録する。

## 認証方式と確認範囲

公式OAuthではなく、既存のX Web Cookie (`auth_token` / `ct0`) とBearer、transaction署名を使用する。`GET https://api.x.com/1.1/account/settings.json` が返す認証主体の `screen_name` が `_biccame_musume` と一致した場合のみ、読み取り認証成功とする。公開プロフィール取得だけでは成功と判定しない。APIの `errors`、非JSON応答、未知の応答は確認失敗とする。

この読み取り経路は[TwikitのV11Client.settings](https://github.com/d60/twikit/blob/main/twikit/client/v11.py)および[Client.user_id](https://github.com/d60/twikit/blob/main/twikit/client/client.py)と同じ方式。非公開Web APIのため仕様変更がありうる。mockで契約を検査しており、実Cookieを使う通信は検証に含めない。書き込み権限や後続投稿の成功までは保証しない。

管理画面 `/admin/twitter` の既存チェックは固定の公開プロフィール取得であり、このCronの認証主体確認とは異なる。

## Secretの設定例

以下は名前とプレースホルダーのみ。実値をソース、ログ、fixturesへ記録しない。

```text
TWITTER_AUTH_TOKEN=<投稿用botのauth_token>
TWITTER_CSRF_TOKEN=<同じセッションのct0>
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<webhook-id>/<webhook-token>
```

承認された環境から `bunx wrangler secret put DISCORD_WEBHOOK_URL --config workers/app/wrangler.toml --env production` を実行し、対話入力で登録する。Webhook URLはsecretであり、`[vars]`やコミット対象ファイルには置かない。stagingには既存Cronトリガーがない。

通知先はDiscordのHTTPS Webhookのみ（discord.com / discordapp.com）。通知はメンションを無効化し、時刻・固定の失敗種別・復旧手順だけを送る。Webhook URL、Cookie、API生レスポンス、例外文字列、予期しないアカウント名は送らない。HTTP失敗はステータスだけ、通信失敗は固定メッセージだけを記録する。

## 失敗種別

- `missing_credentials`: Cookie設定が不足。
- `authentication`: 401、またはXの認証エラーcode 32/89/215/239/353（CSRF不一致を含む）。
- `authorization`: 403、凍結/ロックのcode 64/326。必ずしもCookie失効とは限らない。
- `account_mismatch`: 認証主体が投稿用botと異なる。
- `signature`: 署名素材の取得、検証またはtransaction生成に失敗。署名素材配信側の通信障害も含む。
- `rate_limit`: 429、またはXのcode 88。
- `network`: 認証読取APIへの通信失敗/タイムアウト。
- `upstream`: 認証読取APIが5xx。
- `unexpected_response`: 未知のHTTP失敗、JSON/応答スキーマ異常など。

認証の健全性を確認できない場合は、一時障害でも当日の投稿を止める。自動再試行や遅延投稿、Cron再実行時の重複防止はこの監視機能では追加しない。後続の投稿が失敗した場合は既存どおりログを記録する。

## 安全な検証

`bun test __tests__/twitter/twitter-health.test.ts __tests__/twitter/discord.test.ts __tests__/twitter/daily-cron.test.ts` で、HTTP、署名素材、イベント取得、投稿、バッジ評価をmockして確認する。実投稿・Webhook送信・実データ参照は行わない。

デプロイ後の初回Cronで `[Cron] X authenticated session verified` または安全な失敗種別を確認する。通知未設定の場合は `[Discord] ... DISCORD_WEBHOOK_URL is not configured` を確認する。実Cookieが認証読取APIで機能するかは、デプロイ後の確認事項である。
