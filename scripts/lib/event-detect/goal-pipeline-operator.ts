import { z } from 'zod'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { GoalJudgement, GoalPipelineResult } from './goal-pipeline-schema'

export const GOAL_OPERATOR_POLICY = 'symmetric-visible-information-v2-confidence-independent'
export type GoalProofReader = (post: DetectPost) => unknown
const proofSchema = z.object({
  code: z.string().nonempty(),
  strength: z.enum(['explicit', 'model-only']),
  sourceText: z.string().nonempty(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quote: z.string().nonempty(),
  relation: z.string().nonempty(),
  operation: z.string().nonempty()
})
const evidenceWords =
  /名刺|アクキー|アクリルキーホルダ[ー―−ｰ]|アクスタ|アクリルスタンド|缶バッ[ジチ]|ステッカー|ポストカード|ギフトカード|ノベルティ|コースター|プレート|撮影会|お渡し会|記念イベント|展示|ポスパネ|ポスター|パネル|キャラエリア/
const draftSchema = z
  .object({
    title: z.string().nonempty().optional(),
    category: z.enum(['limited_card', 'regular_card', 'ackey', 'acsta', 'other']).optional(),
    stores: z.array(z.string().nonempty()),
    characterIds: z.array(z.string().nonempty()),
    startDate: z.iso.date().optional()
  })
  .passthrough()

const concreteDraft = (judgement: GoalJudgement) => {
  const parsed = draftSchema.safeParse(judgement.draft)
  if (!parsed.success) return false
  return (
    parsed.data.category !== undefined ||
    parsed.data.title !== undefined ||
    parsed.data.startDate !== undefined ||
    parsed.data.stores.length > 0 ||
    parsed.data.characterIds.length > 0
  )
}

// 新旧同じ情報・操作を観測し、新版だけのdiscovery flagやgoldを一切参照しない。
export const observeGoalOperator = (result: GoalPipelineResult, readProof: GoalProofReader) => {
  const sourceTexts = [result.post.text, ...(result.post.quoted?.text === undefined ? [] : [result.post.quoted.text])]
  const candidates = result.judgements.map((judgement) => {
    // 新旧ともfocus本文は候補自身のevidence連結。曖昧な同名一致では他候補の根拠を借りない。
    const matches = result.extraction.events.filter(
      (event) => event.item === judgement.item && event.evidence.join('\n') === judgement.post.text
    )
    const item = matches.length === 1 ? matches[0] : undefined
    const evidence =
      item === undefined && judgement.contextOnly ? [result.post.text] : item === undefined ? [] : item.evidence
    const supported = evidence.filter((text) => sourceTexts.some((source) => source.includes(text)))
    const hasMaterialEvidence = supported.some((text) => evidenceWords.test(text))
    const base = { ...result.post, text: supported.join('\n') }
    const proofInput: DetectPost = {
      ...base,
      extractionContext: {
        kind: judgement.contextOnly ? 'event' : 'item',
        item: judgement.item,
        evidence: supported.length === 0 ? [result.post.text] : supported,
        originalText: result.post.text,
        ...(result.post.quoted?.text === undefined
          ? {}
          : { quotedText: result.post.quoted.text, quotedScreenName: result.post.quoted.screenName })
      }
    }
    const parsed = z.array(proofSchema).safeParse(readProof(proofInput))
    if (!parsed.success) throw new Error('Invalid common operator evidence proof')
    const proofs = parsed.data.filter(
      (proof) =>
        sourceTexts.some((source) => source.includes(proof.sourceText)) &&
        proof.quote === proof.sourceText.slice(proof.start, proof.end) &&
        proof.quote.length > 0
    )
    const answer = judgement.response.answers.is_event
    const probability = answer?.type === 'noul' ? answer.noul : null
    // 旧DTOのdraftはheldだけ。ignoredでも保存item名と回答は表示され、先行featureで手動連携できる。
    const draft = judgement.decision.status !== 'ignored' && concreteDraft(judgement)
    const visibleSavedItem =
      item !== undefined && !judgement.contextOnly && evidenceWords.test(item.item) && hasMaterialEvidence
    const concreteInformation = draft || visibleSavedItem
    const inspectableAction = ['register', 'held', 'ignored'].includes(judgement.decision.status)
    const explicit = proofs.some((proof) => proof.strength === 'explicit')
    const weakSupported =
      proofs.some((proof) => proof.strength === 'model-only') && probability !== null && probability >= 0.5
    const highModelSupported = probability !== null && probability >= 0.9
    const visibleCandidate = concreteInformation && hasMaterialEvidence && inspectableAction
    const relationConfirmed =
      concreteInformation &&
      hasMaterialEvidence &&
      inspectableAction &&
      (explicit || weakSupported || highModelSupported)
    const detected = visibleCandidate
    return {
      item: judgement.item,
      probability,
      concreteDraft: draft,
      visibleSavedItem,
      concreteInformation,
      sourceSupported: hasMaterialEvidence,
      inspectableAction,
      proofCodes: proofs.map((proof) => proof.code),
      visibleCandidate,
      relationConfirmed,
      detected,
      reason: detected ? 'visible-supported-candidate' : 'insufficient-visible-supported-information'
    }
  })
  return {
    policy: GOAL_OPERATOR_POLICY,
    detected: candidates.some((item) => item.detected),
    visibleCandidate: candidates.some((item) => item.visibleCandidate),
    candidates
  }
}
