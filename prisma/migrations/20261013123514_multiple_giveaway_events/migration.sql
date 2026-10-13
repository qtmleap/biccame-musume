-- AlterTable
ALTER TABLE "webhook_event_jobs" ADD COLUMN "extraction_json" TEXT;

-- CreateTable
CREATE TABLE "webhook_event_candidates" (
    "event_uuid" TEXT NOT NULL PRIMARY KEY,
    "post_id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "store_key" TEXT,
    "post_json" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
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
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "webhook_event_candidates_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "webhook_event_jobs" ("post_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_candidates_semantic_key_key" ON "webhook_event_candidates"("semantic_key");

-- CreateIndex
CREATE INDEX "webhook_event_candidates_post_id_idx" ON "webhook_event_candidates"("post_id");

-- 既存の判定・登録・通知状態を1件の候補として保持する。
INSERT INTO webhook_event_candidates (
  event_uuid,post_id,item,post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,
  model,question_version,confidence,judged_at,event_id,semantic_key,attempts,lease_token,lease_until,
  notification_status,notification_id,notification_error,notification_attempts,last_error,created_at,updated_at
)
SELECT event_uuid,post_id,
  CASE WHEN json_valid(candidate_json) THEN COALESCE(json_extract(candidate_json,'$.title'),'既存配布物') ELSE '既存配布物' END,
  post_json,source_url,status,reasons_json,result_json,candidate_json,answers_json,
  model,question_version,confidence,judged_at,event_id,semantic_key,attempts,lease_token,lease_until,
  notification_status,notification_id,notification_error,notification_attempts,last_error,created_at,updated_at
FROM webhook_event_jobs WHERE result_json IS NOT NULL OR answers_json IS NOT NULL OR event_id IS NOT NULL;

UPDATE webhook_event_jobs SET extraction_json='{"version":"legacy-single"}'
WHERE EXISTS (SELECT 1 FROM webhook_event_candidates c WHERE c.post_id=webhook_event_jobs.post_id);
