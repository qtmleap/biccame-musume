/*
  Warnings:

  - You are about to drop the `user_visited_stores` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "user_visited_stores";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "user_stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "store_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_stores_user_id_idx" ON "user_stores"("user_id");

-- CreateIndex
CREATE INDEX "user_stores_status_idx" ON "user_stores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_stores_user_id_store_key_key" ON "user_stores"("user_id", "store_key");
