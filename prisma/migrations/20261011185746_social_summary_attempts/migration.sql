-- 通知manifestを再構築せず、有限復旧の試行回数だけ追加する。
ALTER TABLE "social_summary_runs" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
