-- AlterTable: add optional user_id column to votes for per-user badge tracking
ALTER TABLE "votes" ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE INDEX "votes_user_id_idx" ON "votes"("user_id");
