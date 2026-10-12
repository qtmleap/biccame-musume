-- CreateTable
CREATE TABLE "social_post_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "snapshot_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" BIGINT NOT NULL,
    "lease_token" TEXT,
    "lease_until" BIGINT,
    "delivery_id" TEXT,
    "last_error" TEXT,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);

-- CreateIndex
CREATE INDEX "social_post_jobs_status_available_at_idx" ON "social_post_jobs"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_jobs_channel_key_key" ON "social_post_jobs"("channel", "key");
