import { expect, spyOn, test } from 'bun:test'
import routes from '@api/routes/admin-event-detect'

const body = {
  model: 'clef',
  state: 'private-input-marker',
  questions: { q: { type: 'noul', instructions: 'private-question-marker' } }
}

const post = async (run: () => Promise<unknown>, requestId?: string) =>
  routes.request(
    'http://localhost/admin/event-detect/decide',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(requestId ? { 'X-Event-Detect-Request-Id': requestId } : {}) },
      body: JSON.stringify(body)
    },
    { AI: { run } }
  )

const withLogs = async (check: (logs: string[]) => Promise<void>) => {
  const logs: string[] = []
  const record = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }
  const info = spyOn(console, 'info').mockImplementation(record)
  const error = spyOn(console, 'error').mockImplementation(record)
  try {
    await check(logs)
  } finally {
    info.mockRestore()
    error.mockRestore()
  }
}

const expectSafe = (value: unknown) => {
  const serialized = JSON.stringify(value)
  for (const secret of [
    'private-input-marker',
    'private-question-marker',
    'provider.invalid',
    'secret-token',
    'secret-stack'
  ])
    expect(serialized).not.toContain(secret)
}

test('successful stub preserves response and logs correlated start/end metadata only', async () => {
  await withLogs(async (logs) => {
    const result = { answers: { q: { type: 'noul', noul: 0.5 } } }
    const calls: string[] = []
    const response = await post(async () => {
      calls.push('stub')
      return result
    })
    expect(response.status).toBe(200)
    const actual: unknown = await response.json()
    expect(actual).toEqual(result)
    const requestId = response.headers.get('x-event-detect-request-id')
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/)
    expect(logs).toHaveLength(2)
    for (const phase of ['start', 'end']) {
      expect(logs.some((line) => line.includes(`"phase":"${phase}"`))).toBe(true)
    }
    for (const line of logs) {
      expect(line).toContain(`"requestId":"${requestId}"`)
      expect(line).toContain('"model":"clef"')
      expect(line).toContain('"questionCount":1')
      expect(line).toMatch(/"elapsedMs":\d+/)
    }
    expect(calls).toHaveLength(1)
    expectSafe(logs)
  })
})

test('internal reference is correlated without exception text, URL or stack', async () => {
  await withLogs(async (logs) => {
    const response = await post(async () => {
      const error = new Error(
        'internal error; reference = s7mr0d35abc12345; https://provider.invalid/?token=secret-token'
      )
      error.stack = 'secret-stack'
      throw error
    })
    expect(response.status).toBe(502)
    const result: unknown = await response.json()
    expect(result).toEqual({
      error: 'clef_call_failed',
      diagnostic: {
        requestId: response.headers.get('x-event-detect-request-id'),
        model: 'clef',
        questionCount: 1,
        phase: 'error',
        elapsedMs: expect.any(Number),
        internalReference: 's7mr0d35abc12345'
      }
    })
    expect(logs).toHaveLength(2)
    expectSafe([logs, result])
  })
})

test('secret-bearing errors and malformed references are never reflected', async () => {
  await withLogs(async (logs) => {
    for (const message of [
      'https://provider.invalid/?token=secret-token',
      `internal error; reference = ${'a'.repeat(65)}; secret-token`,
      'internal error; reference = short; secret-token'
    ]) {
      const response = await post(async () => {
        throw new Error(message)
      })
      const result: unknown = await response.json()
      expect(response.status).toBe(502)
      expect(result).toMatchObject({ error: 'clef_call_failed' })
      expect(JSON.stringify(result)).not.toContain('internalReference')
      expectSafe([logs, result])
    }
  })
})

test('invalid model response never logs or returns the response contents', async () => {
  await withLogs(async (logs) => {
    const response = await post(async () => ({ secret: 'secret-token' }))
    expect(response.status).toBe(502)
    const result: unknown = await response.json()
    expect(result).toMatchObject({ error: 'clef_invalid_response' })
    expectSafe([logs, result])
  })
})

test('invalid correlation header is replaced without logging or reflecting its contents', async () => {
  await withLogs(async (logs) => {
    const response = await post(async () => ({ answers: { q: { type: 'noul', noul: 0.5 } } }), 'secret-token')
    expect(response.headers.get('x-event-detect-request-id')).toMatch(/^[a-f0-9-]{36}$/)
    expectSafe(logs)
  })
})

test('a pending stub logs start only, without inventing cancellation or completion', async () => {
  await withLogs(async (logs) => {
    const requestId = crypto.randomUUID()
    const pending = post(() => new Promise(() => {}), requestId)
    const observed = await Promise.race([
      pending.then(() => 'completed'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 20))
    ])
    expect(observed).toBe('pending')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('"phase":"start"')
    expect(logs[0]).toContain(`"requestId":"${requestId}"`)
    expectSafe(logs)
  })
})
