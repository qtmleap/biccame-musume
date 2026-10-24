import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  type ClefAnswer,
  type ClefRequest,
  ClefRequestSchema,
  type ClefResponse
} from '@biccame/shared/event-detect/clef'
import { DetectionCandidateSchema } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import { extractionStoreOf } from './d1-gold-candidate'
import { sha256Hex } from './d1-gold-schema'
import type { GoalPipelineModule } from './goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from './goal-pipeline-profile'
import { GoalDecisionSchema, type GoalJudgement } from './goal-pipeline-schema'

// キーの順序に依存しない比較用の文字列。
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    )
  return value
}
export const canonicalJson = (value: unknown) => JSON.stringify(canonical(value))

// 選択肢の最上位を確率1.0、他を0に書き換える。しきい値を掛けずに最上位をそのまま採用した場合の再評価に使う。
export const pinTopChoice = (answer: ClefAnswer | undefined): ClefAnswer | undefined => {
  if (answer?.type !== 'choice') return answer
  return {
    type: 'choice',
    choice: answer.choice,
    probabilities: Object.fromEntries(
      Object.keys(answer.probabilities).map((key) => [key, key === answer.choice ? 1 : 0])
    )
  }
}

const mergedRequest = (judgement: GoalJudgement): ClefRequest => {
  const merged = ClefRequestSchema.safeParse({
    ...judgement.requests[0],
    questions: Object.fromEntries(judgement.requests.flatMap((request) => Object.entries(request.questions)))
  })
  if (!merged.success) throw new Error('Invalid saved detection request')
  return merged.data
}

export type ReplayMode = 'saved' | 'top-one'

// 保存した応答を、凍結モジュールの evaluateDetection（本番と同じ関数）に通し直す。AIは呼ばない。
export const replayDecision = (module: GoalPipelineModule, judgement: GoalJudgement, mode: ReplayMode) => {
  const request = mergedRequest(judgement)
  const answers = judgement.response.answers
  const store = pinTopChoice(answers.store)
  const character = pinTopChoice(answers.character)
  const response: ClefResponse =
    mode === 'saved'
      ? { answers }
      : {
          answers: {
            ...answers,
            ...(store === undefined ? {} : { store }),
            ...(character === undefined ? {} : { character })
          }
        }
  const decision = GoalDecisionSchema.safeParse(
    module.evaluateDetection(
      judgement.post,
      request,
      response,
      GOAL_PIPELINE_PROFILE.thresholds,
      extractionStoreOf(request.state)
    )
  )
  if (!decision.success) throw new Error('Invalid replayed decision')
  const candidate = DetectionCandidateSchema.safeParse(decision.data.candidate)
  return {
    status: decision.data.status,
    reasons: decision.data.reasons,
    candidate: candidate.success ? candidate.data : null,
    raw: decision.data
  }
}

// 未改変の応答で再評価し、保存した判定（状態・理由・候補を含む全体）と一致するかを確かめる。
export const checkReplayParity = (module: GoalPipelineModule, judgements: readonly GoalJudgement[]) => {
  const mismatched = judgements.flatMap((judgement, index) => {
    const replay = replayDecision(module, judgement, 'saved')
    return canonicalJson(replay.raw) === canonicalJson(judgement.decision) ? [] : [index]
  })
  return { checked: judgements.length, mismatched: mismatched.length, ok: mismatched.length === 0 }
}

// 凍結メタデータが記録した入力ファイルのハッシュを、作業ツリーの現在の内容と比べる（読み取りだけ）。
export const checkSourceParity = async (metaPath: string, root: string) => {
  const meta = z
    .object({ inputs: z.array(z.object({ file: z.string().nonempty(), sha256: z.string().nonempty() })) })
    .safeParse(JSON.parse(await readFile(metaPath, 'utf8')))
  if (!meta.success) throw new Error('Invalid frozen bundle metadata')
  const rows = await Promise.all(
    meta.data.inputs.map(async (input) => {
      const file = Bun.file(resolve(root, input.file))
      return {
        file: input.file,
        same: (await file.exists()) && sha256Hex(new Uint8Array(await file.arrayBuffer())) === input.sha256
      }
    })
  )
  return {
    checked: rows.length,
    changed: rows.filter((row) => !row.same).map((row) => row.file),
    detectionTsSame: rows.some((row) => row.file.endsWith('event-detect/detection.ts') && row.same)
  }
}
