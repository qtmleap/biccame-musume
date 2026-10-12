-- 生SQLの保存経路が epoch ミリ秒の INTEGER で書いた DateTime 列を、Prisma の D1 アダプタと同じ文字列形式へ揃える。
-- 形式は Date.toISOString の Z を +00:00 に置き換えたもの (例: 2026-10-12T00:00:00.123+00:00)。
-- INTEGER の行だけを書き換えるデータ移行なので、テーブルの再作成は無く、再実行しても結果は変わらない。
UPDATE "events" SET "start_date" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "start_date" / 1000.0, 'unixepoch') WHERE typeof("start_date") = 'integer';
UPDATE "events" SET "end_date" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "end_date" / 1000.0, 'unixepoch') WHERE typeof("end_date") = 'integer';
UPDATE "events" SET "ended_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "ended_at" / 1000.0, 'unixepoch') WHERE typeof("ended_at") = 'integer';
UPDATE "events" SET "clef_judged_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "clef_judged_at" / 1000.0, 'unixepoch') WHERE typeof("clef_judged_at") = 'integer';
UPDATE "events" SET "created_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "created_at" / 1000.0, 'unixepoch') WHERE typeof("created_at") = 'integer';
UPDATE "events" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updated_at" / 1000.0, 'unixepoch') WHERE typeof("updated_at") = 'integer';
UPDATE "event_conditions" SET "created_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "created_at" / 1000.0, 'unixepoch') WHERE typeof("created_at") = 'integer';
UPDATE "event_conditions" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updated_at" / 1000.0, 'unixepoch') WHERE typeof("updated_at") = 'integer';
UPDATE "event_reference_urls" SET "created_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "created_at" / 1000.0, 'unixepoch') WHERE typeof("created_at") = 'integer';
UPDATE "event_reference_urls" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updated_at" / 1000.0, 'unixepoch') WHERE typeof("updated_at") = 'integer';
UPDATE "event_stores" SET "created_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "created_at" / 1000.0, 'unixepoch') WHERE typeof("created_at") = 'integer';
UPDATE "event_stores" SET "updated_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', "updated_at" / 1000.0, 'unixepoch') WHERE typeof("updated_at") = 'integer';
