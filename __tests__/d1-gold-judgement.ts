import type { ClefAnswer, ClefResponse } from '@biccame/shared/event-detect/clef'
import { buildDetectionDraft, createDetectionRequests, evaluateDetection } from '@biccame/shared/event-detect/detection'
import type { GoalPipelineModule } from '../scripts/lib/event-detect/goal-pipeline-module'
import { GOAL_PIPELINE_PROFILE } from '../scripts/lib/event-detect/goal-pipeline-profile'
import type { GoalJudgement } from '../scripts/lib/event-detect/goal-pipeline-schema'
import { stubModule } from './d1-gold-fixtures'

export const realPost = {
  id: '1000000000000000001',
  createdAt: '2026-03-10T00:00:00.000Z',
  screenName: 'bic_yuurakuchou',
  kind: 'original' as const,
  text: '3月16日から有楽町店で限定名刺を先着100名様に配布します。どなたでもOK',
  url: 'https://x.com/bic_yuurakuchou/status/1000000000000000001',
  media: []
}

// 実際の evaluateDetection を使うモジュール（通信や抽出は使わない）。
export const realModule = (): GoalPipelineModule => ({ ...stubModule(), evaluateDetection, buildDetectionDraft })

export const pick = (choice: string, probability: number, keys: readonly string[]): ClefAnswer => ({
  type: 'choice',
  choice,
  probabilities: Object.fromEntries(
    keys.map((key) => [key, key === choice ? probability : (1 - probability) / (keys.length - 1)])
  )
})

type Spec = { store: [string, number]; character: [string, number]; category?: string; start?: string }

// 選択肢の最上位と確率を指定して、実リクエストに対する応答・判定・下書きを組み立てる。
export const judgementWith = (
  spec: Spec,
  storeKey: string | null = 'yuurakuchou',
  item = '限定名刺'
): GoalJudgement => {
  const [request] = createDetectionRequests(realPost, 'clef', storeKey)
  const keysOf = (name: string) => {
    const question = request.questions[name]
    return question.type === 'choice' ? Object.keys(question.criteria) : []
  }
  const answers: ClefResponse['answers'] = {
    is_event: { type: 'noul', noul: 0.97 },
    status: pick('announce', 0.95, keysOf('status')),
    category: pick(spec.category === undefined ? 'limited_card' : spec.category, 0.95, keysOf('category')),
    start_date: pick(spec.start === undefined ? 'd20260316' : spec.start, 0.95, keysOf('start_date')),
    end_date: pick('none', 0.95, keysOf('end_date')),
    quantity: pick('q100', 0.95, keysOf('quantity')),
    condition: pick('first_come', 0.95, keysOf('condition')),
    store: pick(spec.store[0], spec.store[1], keysOf('store')),
    character: pick(spec.character[0], spec.character[1], keysOf('character'))
  }
  const response = { answers }
  const decision = evaluateDetection(realPost, request, response, GOAL_PIPELINE_PROFILE.thresholds, storeKey)
  return {
    item,
    post: realPost,
    requests: [request],
    response,
    decision,
    draft: { ...buildDetectionDraft(realPost, answers) },
    outcome: null,
    groundedEvidence: [],
    contextOnly: false
  }
}
