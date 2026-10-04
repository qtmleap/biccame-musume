import { expect, mock, test } from 'bun:test'
import { inspectBotCutover } from '../scripts/inspect-bot-cutover'

const read = async (path: string): Promise<unknown> => {
  if (path === '/accounts') return [{ id: 'synthetic-account' }]
  if (path.endsWith('/schedules')) return { schedules: [{ cron: '*/5 0-12 * * *', created_on: 'unused' }] }
  if (path.endsWith('/secrets')) return [{ name: 'DISCORD_TOKEN', type: 'secret_text', text: 'never-log-this-value' }]
  if (path.endsWith('/settings'))
    return {
      bindings: [
        { name: 'OPENAI_MODEL', type: 'plain_text', text: 'never-log-this-value' },
        { name: 'OPENAI_BASE_URL', type: 'plain_text', text: 'never-log-this-value' }
      ]
    }
  if (path.endsWith('/deployments'))
    return {
      deployments: [
        {
          id: 'synthetic-deployment',
          created_on: '2026-10-03T00:00:00Z',
          versions: [{ version_id: 'synthetic-version', percentage: 100 }],
          annotations: { private: 'never-log-this-value' }
        }
      ]
    }
  throw new Error('Unexpected metadata path')
}

test('cutover inspection stores names/schedules/rollback IDs but discards binding values', async () => {
  const request = mock(read)
  const result = await inspectBotCutover(request, 'synthetic-account')
  expect(JSON.stringify(result)).not.toContain('never-log-this-value')
  expect(result.secretNames).toEqual(['DISCORD_TOKEN'])
  expect(result.schedules).toEqual([{ cron: '*/5 0-12 * * *' }])
  expect(result.deployments[0].versions).toEqual([{ version_id: 'synthetic-version', percentage: 100 }])
  expect(result.missingBindings).toEqual([
    'TWITTER_BEARER_TOKEN',
    'TWITTER_AUTH_TOKEN',
    'TWITTER_CSRF_TOKEN',
    'DISCORD_CHANNEL_ID',
    'OPENAI_API_KEY'
  ])
  expect(request).toHaveBeenCalledTimes(5)
})

test('inspection refuses a missing or mistyped account before querying the Worker', async () => {
  const request = mock(read)
  await expect(inspectBotCutover(request)).rejects.toThrow('Specify --account= explicitly')
  await expect(inspectBotCutover(request, 'mistyped-account')).rejects.toThrow('Specify --account= explicitly')
  expect(request.mock.calls).toEqual([['/accounts'], ['/accounts']])
})

test('unexpected remote metadata does not escape through validation errors', async () => {
  await expect(
    inspectBotCutover(
      async (path) =>
        path === '/accounts'
          ? [{ id: 'synthetic-account' }]
          : {
              unexpected: 'never-log-this-value'
            },
      'synthetic-account'
    )
  ).rejects.toThrow('Worker metadata validation failed; no raw data written')
})
