import { describe, expect, test } from 'bun:test'
import {
  AUTO_LINKED_REASON,
  isAutoRegisteredWebhookJob,
  isLinkedWebhookJob,
  LINKED_WEBHOOK_REASONS,
  MANUALLY_LINKED_REASON
} from './webhook-rejudge'

describe('isLinkedWebhookJob', () => {
  test('連携の理由は手動と自動の 2 つで、どちらも登録済みのときだけ連携したジョブになる', () => {
    expect(LINKED_WEBHOOK_REASONS).toEqual(['manually_linked', 'auto_linked'])
    expect(isLinkedWebhookJob('registered', [MANUALLY_LINKED_REASON])).toBe(true)
    expect(isLinkedWebhookJob('registered', [AUTO_LINKED_REASON])).toBe(true)
    expect(isLinkedWebhookJob('registered', ['title_generated', AUTO_LINKED_REASON])).toBe(true)
  })

  test('登録済み以外、連携の理由が無い、理由に部分一致するだけのものは連携したジョブではない', () => {
    for (const status of ['held', 'ignored', 'failed', 'queued', 'processing'])
      expect(isLinkedWebhookJob(status, [AUTO_LINKED_REASON, MANUALLY_LINKED_REASON])).toBe(false)
    expect(isLinkedWebhookJob('registered', [])).toBe(false)
    expect(isLinkedWebhookJob('registered', ['title_generated'])).toBe(false)
    expect(isLinkedWebhookJob('registered', ['possible_duplicate:auto_linked_x', 'manually_linked_x'])).toBe(false)
  })
})

describe('isAutoRegisteredWebhookJob', () => {
  test('連携したジョブ（手動・自動）は自動登録済みと扱わない', () => {
    expect(isAutoRegisteredWebhookJob('registered', [MANUALLY_LINKED_REASON])).toBe(false)
    expect(isAutoRegisteredWebhookJob('registered', [AUTO_LINKED_REASON])).toBe(false)
  })

  test('連携の理由が無い登録済みだけが自動登録済み', () => {
    expect(isAutoRegisteredWebhookJob('registered', [])).toBe(true)
    expect(isAutoRegisteredWebhookJob('registered', ['title_generated'])).toBe(true)
    expect(isAutoRegisteredWebhookJob('held', [])).toBe(false)
    expect(isAutoRegisteredWebhookJob('ignored', [])).toBe(false)
  })
})
