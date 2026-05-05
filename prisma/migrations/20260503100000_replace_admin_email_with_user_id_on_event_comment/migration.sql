-- AlterTable
ALTER TABLE "event_comments" DROP COLUMN "admin_email";
ALTER TABLE "event_comments" ADD COLUMN "user_id" TEXT;
