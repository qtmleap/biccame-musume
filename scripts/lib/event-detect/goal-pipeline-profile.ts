import type { DetectionThresholds } from '@biccame/shared/event-detect/detection'

// 非秘密status snapshotの実効値を両armへ固定し、実行途中のKV変更は取り込まない。
export const GOAL_PIPELINE_PROFILE = {
  version: 'runtime-snapshot-v1',
  provenance: 'allowlisted-local-worker-runtime-snapshot-frozen-for-both-arms',
  snapshotFileSha256: '447af657e5c52635aeeb325efe3d955c0eb0e1f7410bcedf9dd633ccc519877b',
  model: 'clef',
  extractionModel: 'claude-haiku-5-5',
  choiceThreshold: 0.9,
  thresholds: {
    eventThreshold: 0.9,
    fieldThreshold: 0.9,
    ignoreThreshold: 0.5,
    fieldThresholds: {
      status: 0.8,
      category: 0.85,
      store: 0.9,
      start_date: 0.9,
      end_date: 0.9,
      quantity: 0.9,
      condition: 0.9,
      purchase_amount: 0.9
    }
  } satisfies DetectionThresholds
} as const
