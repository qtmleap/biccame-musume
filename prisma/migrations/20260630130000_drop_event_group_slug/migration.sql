-- DropIndex
DROP INDEX "event_groups_slug_key";

-- AlterTable
ALTER TABLE "event_groups" DROP COLUMN "slug";
