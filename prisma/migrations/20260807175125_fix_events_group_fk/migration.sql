-- events.group_id に FK 制約を追加する (schema.prisma の onDelete: SetNull を DB 側に反映)。
--
-- 重要: D1 は PRAGMA foreign_keys=OFF を無視する。Prisma が生成する RedefineTables は
-- DROP TABLE "events" を含むため、そのまま流すと events(id) を ON DELETE CASCADE で参照する
-- 子テーブル 5 つ (event_conditions / event_reference_urls / event_stores / user_events /
-- event_comments) が全件消える。defer_foreign_keys=ON だけでは防げないことを実測で確認済み。
-- そのため子テーブルを一時テーブルへ退避し、events 再定義後に書き戻す。

-- FK 制約が無かったため EventGroup 削除時に SetNull が発火せず、宙吊りの group_id が残りうる。
-- 掃除しないと FK 追加時に制約違反で失敗する。
UPDATE "events" SET "group_id" = NULL
WHERE "group_id" IS NOT NULL AND "group_id" NOT IN (SELECT "id" FROM "event_groups");

-- 子テーブルを退避 (CREATE TABLE AS は FK 制約を引き継がないので CASCADE の対象外)
CREATE TABLE "backup_event_conditions" AS SELECT * FROM "event_conditions";
CREATE TABLE "backup_event_reference_urls" AS SELECT * FROM "event_reference_urls";
CREATE TABLE "backup_event_stores" AS SELECT * FROM "event_stores";
CREATE TABLE "backup_user_events" AS SELECT * FROM "user_events";
CREATE TABLE "backup_event_comments" AS SELECT * FROM "event_comments";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "limited_quantity" INTEGER,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "ended_at" DATETIME,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_preliminary" BOOLEAN NOT NULL DEFAULT false,
    "group_id" TEXT,
    "character_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "event_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_events" ("category", "character_id", "created_at", "end_date", "ended_at", "group_id", "id", "is_preliminary", "is_verified", "limited_quantity", "start_date", "title", "updated_at") SELECT "category", "character_id", "created_at", "end_date", "ended_at", "group_id", "id", "is_preliminary", "is_verified", "limited_quantity", "start_date", "title", "updated_at" FROM "events";
DROP TABLE "events";
ALTER TABLE "new_events" RENAME TO "events";
CREATE INDEX "events_group_id_idx" ON "events"("group_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 退避した子テーブルを書き戻す (DROP TABLE "events" の CASCADE で消えた分の復元)
INSERT INTO "event_conditions" SELECT * FROM "backup_event_conditions";
INSERT INTO "event_reference_urls" SELECT * FROM "backup_event_reference_urls";
INSERT INTO "event_stores" SELECT * FROM "backup_event_stores";
INSERT INTO "user_events" SELECT * FROM "backup_user_events";
INSERT INTO "event_comments" SELECT * FROM "backup_event_comments";

DROP TABLE "backup_event_conditions";
DROP TABLE "backup_event_reference_urls";
DROP TABLE "backup_event_stores";
DROP TABLE "backup_user_events";
DROP TABLE "backup_event_comments";
