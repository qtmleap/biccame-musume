-- 開催店舗と独立した対象キャラクターを保持する。既存テーブルは再定義しない。
CREATE TABLE "event_characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "event_characters_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 検索と重複防止の索引
CREATE INDEX "event_characters_event_id_idx" ON "event_characters"("event_id");

-- 検索と重複防止の索引
CREATE UNIQUE INDEX "event_characters_event_id_character_id_key" ON "event_characters"("event_id", "character_id");

-- 明示された旧対象のみ移す。店舗から推定された未判定の対象は確定させない。
INSERT INTO "event_characters" ("id", "event_id", "character_id", "created_at", "updated_at")
SELECT 'legacy:' || "id", "id", "character_id", "created_at", "updated_at"
FROM "events"
WHERE "character_id" IS NOT NULL;
