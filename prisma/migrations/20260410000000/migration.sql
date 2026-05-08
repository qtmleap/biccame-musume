-- RenameColumn: Event.name -> Event.title (data-preserving via table redefinition)
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_events" ("id", "category", "title", "limited_quantity", "start_date", "end_date", "ended_at", "is_verified", "is_preliminary", "created_at", "updated_at")
SELECT "id", "category", "name", "limited_quantity", "start_date", "end_date", "ended_at", "is_verified", "is_preliminary", "created_at", "updated_at" FROM "events";
DROP TABLE "events";
ALTER TABLE "new_events" RENAME TO "events";

-- RedefineIndex
DROP INDEX IF EXISTS "user_events_userId_eventId_status_key";
CREATE UNIQUE INDEX "user_events_user_id_event_id_status_key" ON "user_events"("user_id", "event_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
