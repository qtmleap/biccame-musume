-- AlterTable
ALTER TABLE "webhook_event_candidates" ADD COLUMN "requests_json" TEXT;

-- AlterTable
ALTER TABLE "webhook_event_jobs" ADD COLUMN "requests_json" TEXT;
