import { describe, expect, test } from 'bun:test'
import { DETECTION_VERSION } from './detection'
import { webhookPromptDefinitions } from './prompt-definitions'
import { promptVersionLabel } from './prompt-version-label'

// 抽出用（giveaways-*）は受信詳細の「プロンプトバージョン」に出ないので、webhook判定用だけを対象にする。
const webhookVersionIds = webhookPromptDefinitions
  .map((definition) => definition.questionVersion)
  .filter((id) => !id.startsWith('giveaways-'))

describe('プロンプトバージョンの表示名', () => {
  test.each([
    ['v2-webhook-v4', 'v4'],
    ['v3-webhook-v5-associations', 'v5'],
    ['v4-webhook-v10-operation-updates', 'v10'],
    ['v5-webhook-v13-choice-associations', 'v13'],
    ['v5-webhook-v14-concise-choices', 'v14'],
    ['v5-webhook-v15-concise-author', 'v15'],
    ['v5-webhook-v16-confirm-selection', 'v16'],
    ['v5-webhook-v17-store-character', 'v17'],
    ['v5-webhook-v18-store-confirm-default', 'v18']
  ])('%s は版番号だけの表示名にする', (id, label) => {
    expect(promptVersionLabel(id)).toBe(label)
  })

  test('登録済みの全版が「v<数字>」だけの形になり、説明を含まない', () => {
    expect(webhookVersionIds.length).toBeGreaterThan(0)
    for (const id of webhookVersionIds) {
      expect(promptVersionLabel(id)).toMatch(/^v\d+$/)
    }
  })

  test('保存済みのwebhook判定用の全版に表示名がある（登録漏れの版IDが差分に出る）', () => {
    const unregistered = webhookVersionIds.filter((id) => promptVersionLabel(id) === id)
    expect(unregistered).toEqual([])
  })

  test('現在の判定バージョンにも表示名がある（版を上げたときに登録を促す）', () => {
    expect(promptVersionLabel(DETECTION_VERSION)).not.toBe(DETECTION_VERSION)
  })

  test('表示名の版番号はIDの webhook-v<数字> と一致する', () => {
    const mismatched = webhookVersionIds.filter((id) => {
      const match = /webhook-v(\d+)/.exec(id)
      return match === null || promptVersionLabel(id) !== `v${match[1]}`
    })
    expect(mismatched).toEqual([])
  })

  test('表示名の版番号は版どうしで重複しない', () => {
    const labels = webhookVersionIds.map((id) => promptVersionLabel(id))
    expect(new Set(labels).size).toBe(labels.length)
  })

  test.each(['', 'synthetic-v1', 'recorded-v4', 'unknown-version', 'giveaways-v7-source-spans'])(
    '未登録のID「%s」はそのまま返す',
    (id) => {
      expect(promptVersionLabel(id)).toBe(id)
    }
  )
})
