-- CreateTable
CREATE TABLE "event_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "item_type" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "event_groups_slug_key" ON "event_groups"("slug");

-- AlterTable: link events to an optional event group
ALTER TABLE "events" ADD COLUMN "group_id" TEXT;

-- CreateIndex
CREATE INDEX "events_group_id_idx" ON "events"("group_id");
