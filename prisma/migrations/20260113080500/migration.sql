-- CreateTable
CREATE TABLE "event_conditions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "purchase_amount" INTEGER,
    "quantity" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "event_conditions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_reference_urls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "event_reference_urls_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "store_key" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "event_stores_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limited_quantity" INTEGER,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME,
    "ended_at" DATETIME,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_preliminary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vote_counts" (
    "character_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,

    PRIMARY KEY ("character_id", "year")
);

-- CreateIndex
CREATE INDEX "event_conditions_event_id_idx" ON "event_conditions"("event_id");

-- CreateIndex
CREATE INDEX "event_reference_urls_event_id_idx" ON "event_reference_urls"("event_id");

-- CreateIndex
CREATE INDEX "event_stores_event_id_idx" ON "event_stores"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_stores_event_id_store_key_key" ON "event_stores"("event_id", "store_key");

-- CreateIndex
CREATE INDEX "votes_character_id_idx" ON "votes"("character_id");

-- CreateIndex
CREATE INDEX "votes_ip_address_character_id_idx" ON "votes"("ip_address", "character_id");

-- CreateIndex
CREATE INDEX "votes_created_at_idx" ON "votes"("created_at");
