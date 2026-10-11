-- CreateTable
CREATE TABLE "webhook_event_jobs" (
    "post_id" TEXT NOT NULL PRIMARY KEY,
    "post_json" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "event_uuid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reasons_json" TEXT NOT NULL DEFAULT '[]',
    "result_json" TEXT,
    "candidate_json" TEXT,
    "answers_json" TEXT,
    "model" TEXT,
    "question_version" TEXT,
    "confidence" REAL,
    "judged_at" DATETIME,
    "event_id" TEXT,
    "semantic_key" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" TEXT,
    "lease_until" DATETIME,
    "notification_status" TEXT NOT NULL DEFAULT 'pending',
    "notification_id" TEXT,
    "notification_error" TEXT,
    "notification_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_jobs_event_uuid_key" ON "webhook_event_jobs"("event_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_jobs_semantic_key_key" ON "webhook_event_jobs"("semantic_key");

-- CreateIndex
CREATE INDEX "webhook_event_jobs_status_created_at_idx" ON "webhook_event_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "webhook_event_jobs_notification_status_idx" ON "webhook_event_jobs"("notification_status");
