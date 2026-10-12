-- CreateTable
CREATE TABLE "social_summary_runs" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "scheduled_at" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "manifest_json" TEXT NOT NULL DEFAULT '[]',
    "lease_token" TEXT,
    "lease_until" BIGINT,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);

-- CreateIndex
CREATE INDEX "social_summary_runs_status_lease_until_idx" ON "social_summary_runs"("status", "lease_until");
