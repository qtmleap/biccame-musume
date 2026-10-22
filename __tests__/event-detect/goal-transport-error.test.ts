import { expect, spyOn, test } from 'bun:test'
import { createGoalModelClient } from '../../scripts/lib/event-detect/goal-pipeline-client'
import { describeGoalTransportError, GoalTransportError } from '../../scripts/lib/event-detect/goal-transport-error'

const errorWithName = (name: string) => {
  const error = new Error('https://provider.invalid/?token=secret-token')
  error.name = name
  return error
}

test('transport classification distinguishes deadline, abort and network', () => {
  const cases = [
    { error: errorWithName('TimeoutError'), signal: new AbortController().signal, kind: 'deadline' },
    { error: errorWithName('AbortError'), signal: new AbortController().signal, kind: 'abort' },
    { error: errorWithName('TypeError'), signal: new AbortController().signal, kind: 'network' },
    {
      error: new Error('irrelevant'),
      signal: AbortSignal.abort(new DOMException('hidden', 'TimeoutError')),
      kind: 'deadline'
    },
    { error: new Error('irrelevant'), signal: AbortSignal.abort(), kind: 'abort' }
  ]
  for (const { error, signal, kind } of cases) {
    const diagnostic = describeGoalTransportError(error, signal, 'judge', 120000.4)
    expect(diagnostic.kind).toBe(kind)
    expect(diagnostic.stage).toBe('judge')
    expect(diagnostic.elapsedMs).toBe(120000)
    expect(JSON.stringify(diagnostic)).not.toContain('secret-token')
    expect(JSON.stringify(diagnostic)).not.toContain('provider.invalid')
  }
})

test('only allowlisted exception names and cause codes survive', () => {
  const safe = new Error('secret-token', { cause: { code: 'ECONNRESET', message: 'secret-token' } })
  expect(describeGoalTransportError(safe, new AbortController().signal, 'count', 5)).toMatchObject({
    name: 'Error',
    causeCode: 'ECONNRESET'
  })
  const unsafe = new Error('secret-token', { cause: { code: 'secret-token' } })
  unsafe.name = 'secret-token'
  const diagnostic = describeGoalTransportError(unsafe, new AbortController().signal, 'extract', 5)
  expect(diagnostic.name).toBe('UnknownError')
  expect(diagnostic.causeCode).toBeUndefined()
  expect(new GoalTransportError(diagnostic).message).not.toContain('secret-token')
})

test('benchmark client retains safe diagnostics in persisted error message without network calls', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async () => {
        throw new TypeError('https://provider.invalid/?token=secret-token', { cause: { code: 'ECONNREFUSED' } })
      },
      { preconnect: globalThis.fetch.preconnect }
    )
  )
  const starts: string[] = []
  const client = createGoalModelClient({
    decideEndpoint: 'http://localhost:15175/api/admin/event-detect/decide',
    extractionEndpoint: 'http://localhost:15175/api/admin/event-detect/extract-evaluate',
    beforeCall: async (stage) => {
      starts.push(stage)
    },
    afterCall: async () => {
      throw new Error('unexpected response')
    }
  })
  try {
    const error: unknown = await client
      .run({ model: 'clef', state: 'offline', questions: { q: { type: 'noul', instructions: 'offline' } } }, 'judge')
      .catch((error: unknown) => error)
    expect(error).toBeInstanceOf(GoalTransportError)
    if (!(error instanceof GoalTransportError)) throw new Error('Expected safe transport error')
    expect(error.diagnostic).toMatchObject({
      kind: 'network',
      stage: 'judge',
      name: 'TypeError',
      causeCode: 'ECONNREFUSED'
    })
    expect(error.message).toContain('Evaluation transport failure')
    expect(error.message).not.toContain('secret-token')
    expect(error.message).not.toContain('provider.invalid')
    expect(starts).toEqual(['judge'])
    expect(fetcher).toHaveBeenCalledTimes(1)
    const init = fetcher.mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.signal?.aborted).toBe(false)
    expect(new Headers(init?.headers).get('X-Event-Detect-Request-Id')).toBe(error.diagnostic.requestId)
    expect(error.diagnostic.requestId).toMatch(/^[a-f0-9-]{36}$/)
    expect(error.message).toContain(error.diagnostic.requestId)
    expect(String(init?.body)).not.toContain(error.diagnostic.requestId)
  } finally {
    fetcher.mockRestore()
  }
})

test('HTTP and invalid JSON failures retain the client UUID without response contents', async () => {
  for (const scenario of [
    { status: 502, body: 'secret-response-marker', prefix: 'Evaluation endpoint returned HTTP 502' },
    { status: 200, body: 'secret-response-marker', prefix: 'Invalid evaluation JSON response' }
  ]) {
    const fetcher = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(async () => new Response(scenario.body, { status: scenario.status }), {
        preconnect: globalThis.fetch.preconnect
      })
    )
    const client = createGoalModelClient({
      decideEndpoint: 'http://localhost:15175/api/admin/event-detect/decide',
      extractionEndpoint: 'http://localhost:15175/api/admin/event-detect/extract-evaluate',
      beforeCall: async () => {},
      afterCall: async () => {}
    })
    try {
      const error: unknown = await client
        .run({ model: 'clef', state: 'offline', questions: { q: { type: 'noul', instructions: 'offline' } } }, 'judge')
        .catch((error: unknown) => error)
      if (!(error instanceof Error)) throw new Error('Expected safe endpoint error')
      const init = fetcher.mock.calls[0]?.[1]
      const requestId = new Headers(init?.headers).get('X-Event-Detect-Request-Id')
      expect(requestId).toMatch(/^[a-f0-9-]{36}$/)
      expect(error.message).toBe(`${scenario.prefix}; requestId=${requestId}`)
      expect(error.message).not.toContain('secret-response-marker')
    } finally {
      fetcher.mockRestore()
    }
  }
})
