import { expect, test } from 'bun:test'
import { readAtomicManualEvent } from '@api/services/event-service'
import { saveAtomicManualEvent } from '@api/services/event-service-atomic'
import { toConditionsCreate } from '@api/services/event-service-payload'
import { webhookConditionIdentity } from '@api/services/webhook-event-identity'
import { registerWebhookEvent, validateWebhookEvent } from '@api/services/webhook-jobs'
import { getWebhookPrompt, saveWebhookPromptAttempt } from '@api/services/webhook-prompt'
import { eventConditionTexts } from '@biccame/shared/domain/social-post'
import { createDetectionRequests, DETECTION_VERSION } from '@biccame/shared/event-detect/detection'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useFieldArray, useForm } from 'react-hook-form'
import { ConditionsSection } from '@/components/admin/form/conditions-section'
import { conditionLabels } from '@/images/format'
import { type EventFormValues, toEventPayload } from '@/lib/event-form'
import { event, makeJob, withRejudgeEnv } from './fixtures/webhook-d1-jobs'

const chargeCondition = {
  uuid: '33333333-3333-4333-a333-333333333333',
  type: 'charge' as const,
  chargeAmount: 1000
}
const chargeEvent: EventRequest = { ...event, category: 'other', conditions: [chargeCondition] }

const ConditionForm = () => {
  const { control, register } = useForm<EventFormValues>({
    defaultValues: { conditions: [chargeCondition] }
  })
  const { fields, remove, append } = useFieldArray({ control, name: 'conditions' })
  return createElement(ConditionsSection, { fields, register, remove, append })
}

test('入金条件は編集欄と送信payloadで購入条件に変わらない', () => {
  const markup = renderToStaticMarkup(createElement(ConditionForm))
  expect(markup).toContain('入金金額')
  expect(markup).toContain('conditions.0.chargeAmount')
  expect(markup).toContain('円以上入金')
  expect(markup).not.toContain('conditions.0.purchaseAmount')
  const values: EventFormValues = { ...chargeEvent, endDate: '', endedAt: '', groupId: '' }
  expect(toEventPayload(values, { isEditMode: true, fallbackUuid: event.uuid }).conditions).toEqual([chargeCondition])
  expect(toConditionsCreate(chargeEvent, true)).toEqual([
    { id: chargeCondition.uuid, type: 'charge', chargeAmount: 1000, purchaseAmount: undefined, quantity: undefined }
  ])
})

test('SNSと画像の条件表記は入金と購入を区別し、未入力を0円と推測しない', () => {
  const conditions = [chargeCondition, { uuid: event.uuid, type: 'purchase' as const, purchaseAmount: 4000 }]
  expect(conditionLabels({ conditions, limitedQuantity: undefined })).toEqual(['1,000円以上入金', '4,000円以上購入'])
  expect(conditionLabels({ conditions: [{ uuid: event.uuid, type: 'charge' }], limitedQuantity: undefined })).toEqual([
    '入金・チャージ'
  ])
})

test('条件同一性と登録検証は入金金額を保持し、不正な入金を拒否する', () => {
  const valid = validateWebhookEvent(chargeEvent, event.uuid)
  expect(valid.conditions).toEqual([chargeCondition])
  expect(webhookConditionIdentity(chargeEvent)).not.toBe(
    webhookConditionIdentity({ ...chargeEvent, conditions: [{ ...chargeCondition, chargeAmount: 2000 }] })
  )
  expect(() =>
    validateWebhookEvent({ ...chargeEvent, conditions: [{ ...chargeCondition, chargeAmount: undefined }] }, event.uuid)
  ).toThrow()
  expect(() =>
    validateWebhookEvent({ ...chargeEvent, conditions: [{ ...chargeCondition, chargeAmount: 1.5 }] }, event.uuid)
  ).toThrow()
  expect(() =>
    validateWebhookEvent({ ...chargeEvent, conditions: [{ ...chargeCondition, chargeAmount: -1 }] }, event.uuid)
  ).toThrow()
  expect(() =>
    validateWebhookEvent(
      { ...chargeEvent, conditions: [{ uuid: chargeCondition.uuid, type: 'charge', purchaseAmount: 1000 }] },
      event.uuid
    )
  ).toThrow()
})

test('atomic作成・更新・読取で入金と購入を別カラムへ保存する', async () => {
  await withRejudgeEnv(async (env) => {
    const created = await saveAtomicManualEvent(env, chargeEvent, 'created')
    expect(created.event.conditions).toMatchObject([{ type: 'charge', chargeAmount: 1000 }])
    expect(created.event.conditions[0].purchaseAmount).toBeUndefined()
    expect(eventConditionTexts(created.event)).toEqual(['1,000円以上入金'])
    const update: EventRequest = {
      ...chargeEvent,
      conditions: [
        { ...created.event.conditions[0], chargeAmount: 2000 },
        { uuid: '44444444-4444-4444-a444-444444444444', type: 'purchase', purchaseAmount: 4000 }
      ]
    }
    await saveAtomicManualEvent(env, update, 'updated')
    const stored = await readAtomicManualEvent(env, event.uuid)
    expect(stored.conditions).toMatchObject([
      { type: 'charge', chargeAmount: 2000 },
      { type: 'purchase', purchaseAmount: 4000 }
    ])
    const rows = await env.DB.prepare(
      'SELECT type,purchase_amount,charge_amount FROM event_conditions ORDER BY rowid'
    ).all()
    expect(rows.results).toEqual([
      { type: 'charge', purchase_amount: null, charge_amount: 2000 },
      { type: 'purchase', purchase_amount: 4000, charge_amount: null }
    ])
  })
})

test('Webhook自動登録経路でも入金条件を保持する', async () => {
  await withRejudgeEnv(async (env) => {
    const job = makeJob()
    await env.DB.prepare(
      'INSERT INTO webhook_event_jobs(post_id,post_json,source_url,event_uuid,status,lease_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
    )
      .bind(job.postId, JSON.stringify(job.post), job.sourceUrl, job.eventUUID, 'processing', 'charge-lease', 1, 1)
      .run()
    await registerWebhookEvent(env, job, chargeEvent, 'charge-lease')
    const stored = await readAtomicManualEvent(env, event.uuid)
    expect(stored.conditions).toMatchObject([{ type: 'charge', chargeAmount: 1000 }])
    expect(stored.conditions[0].purchaseAmount).toBeUndefined()
    expect(eventConditionTexts(stored)).toEqual(['1,000円以上入金'])
  })
})

test('入金額の動的な選択肢を実プロンプト履歴へ保存できる', async () => {
  await withRejudgeEnv(async (env) => {
    const job = makeJob()
    await env.DB.prepare(
      'INSERT INTO webhook_event_jobs(post_id,post_json,source_url,event_uuid,status,lease_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
    )
      .bind(
        job.postId,
        JSON.stringify(job.post),
        job.sourceUrl,
        job.eventUUID,
        'processing',
        'charge-prompt-lease',
        1,
        1
      )
      .run()
    const requests = createDetectionRequests({
      ...job.post,
      text: '有楽町たん記念デザインギフトカードを10/24から先着55名に限定販売。入金金額2,000円以上。'
    })
    expect(requests[0].questions).toHaveProperty('charge_amount')
    await saveWebhookPromptAttempt(
      env,
      { table: 'webhook_event_jobs', column: 'post_id', id: job.postId },
      'charge-prompt-lease',
      DETECTION_VERSION,
      requests
    )
    const saved = await getWebhookPrompt(env, job.postId)
    expect(saved.requests).toEqual(requests)
    expect(saved.source).toBe('recorded')
    expect(saved.definition).not.toBeNull()
  })
})
