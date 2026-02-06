-- CreateTable
CREATE TABLE "user_visited_stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "store_key" TEXT NOT NULL,
    "visited_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_visited_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_interested_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_interested_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_interested_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_completed_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "completed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_completed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_completed_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_visited_stores_user_id_idx" ON "user_visited_stores"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_visited_stores_user_id_store_key_key" ON "user_visited_stores"("user_id", "store_key");

-- CreateIndex
CREATE INDEX "user_interested_events_user_id_idx" ON "user_interested_events"("user_id");

-- CreateIndex
CREATE INDEX "user_interested_events_event_id_idx" ON "user_interested_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_interested_events_user_id_event_id_key" ON "user_interested_events"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "user_completed_events_user_id_idx" ON "user_completed_events"("user_id");

-- CreateIndex
CREATE INDEX "user_completed_events_event_id_idx" ON "user_completed_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_completed_events_user_id_event_id_key" ON "user_completed_events"("user_id", "event_id");
