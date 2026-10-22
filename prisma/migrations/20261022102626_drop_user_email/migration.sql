/*
  Warnings:

  - You are about to drop the column `email` on the `users` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "display_name" TEXT,
    "thumbnail_url" TEXT,
    "screen_name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("created_at", "display_name", "id", "screen_name", "thumbnail_url", "updated_at") SELECT "created_at", "display_name", "id", "screen_name", "thumbnail_url", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
