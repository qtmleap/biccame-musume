import { z } from 'zod'

export const LiveApprovalSchema = z.object({
  decision: z.literal('approved'),
  liveEvaluationApproved: z.literal(true),
  baselineBundleSha256: z.string().nonempty(),
  candidateBundleSha256: z.string().nonempty(),
  caseHash: z.string().nonempty(),
  operatorPolicyHash: z.string().nonempty(),
  profileHash: z.string().nonempty(),
  adapterHash: z.string().nonempty()
})

export type LiveApprovalTarget = {
  baselineBundleSha256: string
  candidateBundleSha256: string
  caseHash: string
  operatorPolicyHash: string
  profileHash: string
  adapterHash: string
}

// 承認は特定のbundle・ケース集合・observer・profile・adapterの組だけに有効で、別datasetのケースhashには流用できない。
export const isLiveApprovalFor = (approval: unknown, target: LiveApprovalTarget) => {
  const parsed = LiveApprovalSchema.safeParse(approval)
  return (
    parsed.success &&
    parsed.data.baselineBundleSha256 === target.baselineBundleSha256 &&
    parsed.data.candidateBundleSha256 === target.candidateBundleSha256 &&
    parsed.data.caseHash === target.caseHash &&
    parsed.data.operatorPolicyHash === target.operatorPolicyHash &&
    parsed.data.profileHash === target.profileHash &&
    parsed.data.adapterHash === target.adapterHash
  )
}
