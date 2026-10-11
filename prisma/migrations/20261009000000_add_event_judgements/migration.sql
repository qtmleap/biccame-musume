-- AlterTable: record how the LLM and Clef judged each event (all nullable; manually registered events stay null)
ALTER TABLE "events" ADD COLUMN "llm_confidence" REAL;
ALTER TABLE "events" ADD COLUMN "llm_model" TEXT;
ALTER TABLE "events" ADD COLUMN "llm_version" TEXT;
ALTER TABLE "events" ADD COLUMN "llm_post_id" TEXT;
ALTER TABLE "events" ADD COLUMN "llm_answers" TEXT;
ALTER TABLE "events" ADD COLUMN "llm_judged_at" DATETIME;
ALTER TABLE "events" ADD COLUMN "clef_confidence" REAL;
ALTER TABLE "events" ADD COLUMN "clef_model" TEXT;
ALTER TABLE "events" ADD COLUMN "clef_version" TEXT;
ALTER TABLE "events" ADD COLUMN "clef_post_id" TEXT;
ALTER TABLE "events" ADD COLUMN "clef_answers" TEXT;
ALTER TABLE "events" ADD COLUMN "clef_judged_at" DATETIME;
