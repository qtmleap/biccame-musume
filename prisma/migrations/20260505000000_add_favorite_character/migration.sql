-- CreateTable
CREATE TABLE "favorite_characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorite_characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "favorite_characters_user_id_idx" ON "favorite_characters"("user_id");

-- CreateIndex
CREATE INDEX "favorite_characters_character_id_idx" ON "favorite_characters"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_characters_user_id_character_id_key" ON "favorite_characters"("user_id", "character_id");
