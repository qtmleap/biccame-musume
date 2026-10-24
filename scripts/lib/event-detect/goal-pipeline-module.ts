import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { ClefRequest, ClefResponse } from '@biccame/shared/event-detect/clef'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import type { DetectionThresholds } from '@biccame/shared/event-detect/detection'
import { z } from 'zod'
import type { GoalExtraction } from './goal-pipeline-schema'

export const goalHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type GoalFetcher = (url: string, init: RequestInit) => Promise<Response>
const functions = z.object({
  DETECTION_VERSION: z.string().nonempty(),
  EXTRACTION_VERSION: z.string().nonempty(),
  createDetectionRequests: z.custom<
    (post: DetectPost, model?: ClefRequest['model'], storeKey?: string | null) => unknown
  >((value) => typeof value === 'function'),
  createItemCountRequest: z.custom<(post: DetectPost, model?: ClefRequest['model']) => ClefRequest>(
    (value) => typeof value === 'function'
  ),
  auditItemCount: z.custom<(events: GoalExtraction['events'], response: ClefResponse, threshold: number) => unknown>(
    (value) => typeof value === 'function'
  ),
  validateEventExtraction: z.custom<(post: DetectPost, raw: unknown) => unknown>(
    (value) => typeof value === 'function'
  ),
  extractedPost: z.custom<(post: DetectPost, event: GoalExtraction['events'][number]) => unknown>(
    (value) => typeof value === 'function'
  ),
  evaluateDetection: z.custom<
    (
      post: DetectPost,
      request: ClefRequest,
      response: ClefResponse,
      thresholds?: DetectionThresholds,
      storeKey?: string | null
    ) => unknown
  >((value) => typeof value === 'function'),
  buildDetectionDraft: z.custom<(post: DetectPost, answers: ClefResponse['answers']) => unknown>(
    (value) => typeof value === 'function'
  ),
  extractWebhookEvents: z.custom<
    (
      env: { ANTHROPIC_BASE_URL: string; ANTHROPIC_AUTH_TOKEN: string },
      post: DetectPost,
      fetcher: GoalFetcher
    ) => Promise<unknown>
  >((value) => typeof value === 'function'),
  extractionCandidateInputs: z
    .custom<(post: DetectPost, extraction: GoalExtraction) => unknown>((value) => typeof value === 'function')
    .optional(),
  describeDetectionOutcome: z
    .custom<
      (
        post: DetectPost,
        answers: ClefResponse['answers'],
        decision: unknown,
        thresholds?: DetectionThresholds
      ) => unknown
    >((value) => typeof value === 'function')
    .optional(),
  groundedDiscoveryEvidence: z.custom<(post: DetectPost) => unknown>((value) => typeof value === 'function').optional(),
  groundedDiscoveryProof: z.custom<(post: DetectPost) => unknown>((value) => typeof value === 'function').optional()
})

// モデル実行時に可変な作業ツリーを読み込まず、凍結bundleのSHAを毎回検証する。
export const loadGoalPipelineModule = async (file: string) => {
  const metadata = z
    .object({
      version: z.string().nonempty(),
      extractionVersion: z.string().nonempty(),
      bundleSha256: z.string().nonempty(),
      externalDependencies: z.record(z.enum(['zod', 'dayjs']), z.string().nonempty()).optional()
    })
    .safeParse(await Bun.file(file.replace(/\.mjs$/, '.meta.json')).json())
  if (!metadata.success) throw new Error('Invalid pipeline metadata')
  const bytes = await Bun.file(file).arrayBuffer()
  const hash = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
  if (hash !== metadata.data.bundleSha256) throw new Error('Pipeline bundle hash mismatch')
  const dependencyPath = file.replace(/\.mjs$/, '.dependencies.json')
  const dependencySource: unknown =
    metadata.data.externalDependencies === undefined
      ? await Bun.file(dependencyPath).json()
      : metadata.data.externalDependencies
  const dependencies = z.record(z.enum(['zod', 'dayjs']), z.string().nonempty()).safeParse(dependencySource)
  if (!dependencies.success) throw new Error('Invalid pipeline dependency metadata')
  for (const [name, version] of Object.entries(dependencies.data)) {
    const current = z
      .object({ version: z.string().nonempty() })
      .safeParse(await Bun.file(Bun.resolveSync(`${name}/package.json`, process.cwd())).json())
    if (!current.success || current.data.version !== version) throw new Error('Frozen pipeline dependency changed')
  }
  const raw: unknown = await import(pathToFileURL(file).href)
  const parsed = functions.safeParse(raw)
  if (!parsed.success) throw new Error('Invalid pipeline module')
  if (
    parsed.data.DETECTION_VERSION !== metadata.data.version ||
    parsed.data.EXTRACTION_VERSION !== metadata.data.extractionVersion
  )
    throw new Error('Pipeline version mismatch')
  return { ...parsed.data, sha256: hash }
}
export type GoalPipelineModule = Awaited<ReturnType<typeof loadGoalPipelineModule>>
