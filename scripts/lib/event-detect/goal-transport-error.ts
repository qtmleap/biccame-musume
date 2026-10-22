const ERROR_NAMES = ['Error', 'TypeError', 'TimeoutError', 'AbortError'] as const
const CAUSE_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
] as const

// 例外本文・stack・接続先は記録せず、許可した分類だけを保存する。
export type GoalModelStage = 'count' | 'judge' | 'extract'

export const describeGoalTransportError = (
  error: unknown,
  signal: AbortSignal,
  stage: GoalModelStage,
  elapsedMs: number,
  requestId: string = crypto.randomUUID()
) => {
  const name = error instanceof Error ? ERROR_NAMES.find((value) => value === error.name) : undefined
  const cause = error instanceof Error ? error.cause : undefined
  const causeCode =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? CAUSE_CODES.find((value) => value === cause.code)
      : undefined
  const kind =
    signal.reason instanceof Error && signal.reason.name === 'TimeoutError'
      ? 'deadline'
      : name === 'TimeoutError'
        ? 'deadline'
        : signal.aborted || name === 'AbortError'
          ? 'abort'
          : 'network'
  return { kind, stage, requestId, elapsedMs: Math.round(elapsedMs), name: name ?? 'UnknownError', causeCode }
}

export class GoalTransportError extends Error {
  constructor(readonly diagnostic: ReturnType<typeof describeGoalTransportError>) {
    super(`Evaluation transport failure: ${JSON.stringify(diagnostic)}`)
    this.name = 'GoalTransportError'
  }
}
