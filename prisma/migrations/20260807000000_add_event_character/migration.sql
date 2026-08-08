-- AlterTable: link events to an optional target character (defaults to the hosting store)
ALTER TABLE "events" ADD COLUMN "character_id" TEXT;
