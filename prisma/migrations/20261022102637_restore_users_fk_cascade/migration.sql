-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_favorite_characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorite_characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_favorite_characters" ("character_id", "created_at", "id", "user_id") SELECT "character_id", "created_at", "id", "user_id" FROM "favorite_characters";
DROP TABLE "favorite_characters";
ALTER TABLE "new_favorite_characters" RENAME TO "favorite_characters";
CREATE INDEX "favorite_characters_user_id_idx" ON "favorite_characters"("user_id");
CREATE INDEX "favorite_characters_character_id_idx" ON "favorite_characters"("character_id");
CREATE UNIQUE INDEX "favorite_characters_user_id_character_id_key" ON "favorite_characters"("user_id", "character_id");
CREATE TABLE "new_user_badges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "badge_code" TEXT NOT NULL,
    "earned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_badges_badge_code_fkey" FOREIGN KEY ("badge_code") REFERENCES "badges" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_badges" ("badge_code", "earned_at", "id", "user_id") SELECT "badge_code", "earned_at", "id", "user_id" FROM "user_badges";
DROP TABLE "user_badges";
ALTER TABLE "new_user_badges" RENAME TO "user_badges";
CREATE INDEX "user_badges_user_id_idx" ON "user_badges"("user_id");
CREATE INDEX "user_badges_badge_code_idx" ON "user_badges"("badge_code");
CREATE UNIQUE INDEX "user_badges_user_id_badge_code_key" ON "user_badges"("user_id", "badge_code");
CREATE TABLE "new_user_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_events" ("completed_at", "created_at", "event_id", "id", "status", "updated_at", "user_id") SELECT "completed_at", "created_at", "event_id", "id", "status", "updated_at", "user_id" FROM "user_events";
DROP TABLE "user_events";
ALTER TABLE "new_user_events" RENAME TO "user_events";
CREATE INDEX "user_events_user_id_idx" ON "user_events"("user_id");
CREATE INDEX "user_events_event_id_idx" ON "user_events"("event_id");
CREATE INDEX "user_events_status_idx" ON "user_events"("status");
CREATE UNIQUE INDEX "user_events_user_id_event_id_status_key" ON "user_events"("user_id", "event_id", "status");
CREATE TABLE "new_user_stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "store_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_stores" ("created_at", "id", "marked_at", "status", "store_key", "updated_at", "user_id") SELECT "created_at", "id", "marked_at", "status", "store_key", "updated_at", "user_id" FROM "user_stores";
DROP TABLE "user_stores";
ALTER TABLE "new_user_stores" RENAME TO "user_stores";
CREATE INDEX "user_stores_user_id_idx" ON "user_stores"("user_id");
CREATE INDEX "user_stores_status_idx" ON "user_stores"("status");
CREATE UNIQUE INDEX "user_stores_user_id_store_key_key" ON "user_stores"("user_id", "store_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
