import { describe, expect, test } from 'bun:test'
import { EventRequestQuerySchema } from '@biccame/shared/schemas/event.dto'
import { type WebhookJob, WebhookJobStatusSchema } from '@biccame/shared/schemas/webhook.dto'
import { webhookEventCreateSearch } from '@/components/admin/webhook-form-defaults'
import { webhookCandidateTitle } from '@/components/admin/webhook-labels'
import {
  createEventThenLink,
  runSingleFlight,
  WEBHOOK_LINK_FAILED_MESSAGE
} from '@/hooks/use-create-event-with-webhook-link'
import {
  baseJob,
  candidateOf,
  createLink,
  eventOf,
  firstUuid,
  identifiedSection,
  postId,
  renderDetail,
  secondUuid,
  sourceUrl
} from './fixtures/webhook-detail-link'

describe('EventRequestQuerySchema の受信ジョブ紐付け先', () => {
  test('webhookPostId（数字 1〜20 桁）と webhookCandidateId（UUID）を受け付け、どちらも任意', () => {
    expect(EventRequestQuerySchema.safeParse({}).success).toBe(true)
    const parsed = EventRequestQuerySchema.safeParse({ webhookPostId: postId, webhookCandidateId: secondUuid })
    expect(parsed.success && parsed.data).toEqual({ webhookPostId: postId, webhookCandidateId: secondUuid })
    expect(EventRequestQuerySchema.safeParse({ webhookPostId: '1' }).success).toBe(true)
    expect(EventRequestQuerySchema.safeParse({ webhookPostId: '9'.repeat(20) }).success).toBe(true)
    // これまでのクエリ（コピー元や初期値）はそのまま通る
    expect(
      EventRequestQuerySchema.safeParse({ from: firstUuid, title: '名刺', referenceUrls: sourceUrl }).success
    ).toBe(true)
  })

  test.each([
    ['空文字', { webhookPostId: '' }],
    ['数字以外', { webhookPostId: 'abc' }],
    ['符号つき', { webhookPostId: '-1' }],
    ['21 桁', { webhookPostId: '1'.repeat(21) }],
    ['数値（丸められた ID）', { webhookPostId: 1000000000000000000 }],
    ['UUID でない候補 ID', { webhookCandidateId: 'not-a-uuid' }],
    ['空の候補 ID', { webhookCandidateId: '' }]
  ])('不正な値を弾く: %s', (_label, query) => {
    expect(EventRequestQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe('webhookEventCreateSearch', () => {
  test('保留（解決できる状態）のときだけ紐付け先を含める', () => {
    const held = webhookEventCreateSearch(baseJob, { link: { postId } })
    expect(held).toEqual({ referenceUrls: sourceUrl, webhookPostId: postId })
    // 解決できない状態では含めない（resolve API が 409 にするため）
    for (const status of WebhookJobStatusSchema.options.filter((value) => value !== 'held')) {
      const search = webhookEventCreateSearch({ ...baseJob, status }, { link: { postId } })
      expect(search, status).toEqual({ referenceUrls: sourceUrl })
      expect(search, status).not.toHaveProperty('webhookPostId')
      expect(search, status).not.toHaveProperty('webhookCandidateId')
    }
    // 紐付け先を渡さない呼び出し（従来どおり）では、保留でも含めない
    expect(webhookEventCreateSearch(baseJob)).toEqual({ referenceUrls: sourceUrl })
  })

  test('候補 ID は複数候補の投稿のときだけ付く（単一ジョブでは付けない）', () => {
    expect(webhookEventCreateSearch(baseJob, { link: { postId } })).not.toHaveProperty('webhookCandidateId')
    expect(webhookEventCreateSearch(baseJob, { link: { postId, candidateId: secondUuid } })).toEqual({
      referenceUrls: sourceUrl,
      webhookPostId: postId,
      webhookCandidateId: secondUuid
    })
    // 保留でない候補には、候補 ID も付けない
    expect(
      webhookEventCreateSearch({ ...baseJob, status: 'registered' }, { link: { postId, candidateId: secondUuid } })
    ).toEqual({ referenceUrls: sourceUrl })
  })

  test('登録候補があればその題（AI の題）を使い、抽出名は使わない', () => {
    const search = webhookEventCreateSearch(
      { ...baseJob, candidate: eventOf('ハロウィン名刺', firstUuid) },
      { item: '赤い限定名刺' }
    )
    expect(search.title).toBe('ハロウィン名刺')
  })

  test('登録候補が無く下書きだけのときは、下書きの定型題ではなく渡された抽出名を題にする', () => {
    const draft = {
      characterIds: [],
      title: '新東たん アクリルスタンド配布',
      category: 'acsta' as const,
      stores: ['shintou'],
      startDate: '2026-10-19',
      conditions: []
    }
    const withItem = webhookEventCreateSearch({ ...baseJob, draft }, { item: 'アクリルスタンド' })
    expect(withItem).toEqual({
      title: 'アクリルスタンド',
      category: 'acsta',
      stores: 'shintou',
      startDate: '2026-10-19',
      referenceUrls: sourceUrl
    })
    // 抽出名が無ければ今どおり下書きの題
    expect(webhookEventCreateSearch({ ...baseJob, draft }).title).toBe('新東たん アクリルスタンド配布')
    expect(webhookEventCreateSearch({ ...baseJob, draft }, { link: { postId } }).title).toBe(
      '新東たん アクリルスタンド配布'
    )
    // 下書きも無い候補でも、抽出名があれば題の初期値にする
    expect(webhookEventCreateSearch(baseJob, { item: 'アクリルスタンド' })).toEqual({
      title: 'アクリルスタンド',
      referenceUrls: sourceUrl
    })
  })
})

describe('createEventThenLink', () => {
  const payload = eventOf('ハロウィン名刺', firstUuid)

  test('作成に成功したら、作成 API が返したイベントの uuid で受信ジョブへ紐付ける', async () => {
    const calls: string[] = []
    const result = await createEventThenLink(
      {
        createEvent: async (event) => {
          calls.push(`create:${event.title}`)
          // 返ってきた uuid が入力と違っても、紐付けには返ってきた方を使う
          return { uuid: secondUuid }
        },
        linkEvent: async (target, eventId) => {
          calls.push(`link:${target.postId}:${target.candidateId}:${eventId}`)
        }
      },
      payload,
      { postId, candidateId: firstUuid }
    )
    expect(result).toEqual({ linked: true })
    expect(calls).toEqual(['create:ハロウィン名刺', `link:${postId}:${firstUuid}:${secondUuid}`])
  })

  test('単一ジョブでは候補 ID なしで紐付ける', async () => {
    const targets: unknown[] = []
    await createEventThenLink(
      {
        createEvent: async () => ({ uuid: firstUuid }),
        linkEvent: async (target) => {
          targets.push(target)
        }
      },
      payload,
      { postId }
    )
    expect(targets).toEqual([{ postId }])
  })

  test('作成に失敗したら throw して、紐付けは呼ばない（フォームが再送できる状態に戻る）', async () => {
    let linked = 0
    await expect(
      createEventThenLink(
        {
          createEvent: async () => {
            throw new Error('synthetic create failure')
          },
          linkEvent: async () => {
            linked += 1
          }
        },
        payload,
        { postId }
      )
    ).rejects.toThrow('synthetic create failure')
    expect(linked).toBe(0)
  })

  test('紐付けに失敗しても throw せず、作成は成功のまま linked: false を返す（再送でイベントが二重にならない）', async () => {
    let created = 0
    const result = await createEventThenLink(
      {
        createEvent: async () => {
          created += 1
          return { uuid: firstUuid }
        },
        linkEvent: async () => {
          throw new Error('synthetic link failure')
        }
      },
      payload,
      { postId }
    )
    expect(result).toEqual({ linked: false })
    expect(created).toBe(1)
    expect(WEBHOOK_LINK_FAILED_MESSAGE).toContain('イベントは登録しましたが')
    expect(WEBHOOK_LINK_FAILED_MESSAGE).toContain('連携')
  })
})

describe('runSingleFlight', () => {
  const deferred = () => {
    const state: { resolve: () => void } = { resolve: () => {} }
    const promise = new Promise<void>((resolve) => {
      state.resolve = resolve
    })
    return { promise, resolve: () => state.resolve() }
  }

  test('実行中の連打は同じ処理を待ち、二重に始めない。終われば次を受け付ける', async () => {
    const slot: { current: Promise<void> | null } = { current: null }
    const gate = deferred()
    let runs = 0
    const run = async () => {
      runs += 1
      await gate.promise
    }
    const first = runSingleFlight(slot, run)
    const second = runSingleFlight(slot, run)
    expect(second).toBe(first)
    expect(runs).toBe(1)
    gate.resolve()
    await Promise.all([first, second])
    expect(slot.current).toBeNull()
    await runSingleFlight(slot, async () => {
      runs += 1
    })
    expect(runs).toBe(2)
  })

  test('失敗しても枠を空けるので、再送できる', async () => {
    const slot: { current: Promise<void> | null } = { current: null }
    await expect(
      runSingleFlight(slot, async () => {
        throw new Error('synthetic failure')
      })
    ).rejects.toThrow('synthetic failure')
    expect(slot.current).toBeNull()
    let retried = false
    await runSingleFlight(slot, async () => {
      retried = true
    })
    expect(retried).toBe(true)
  })
})

describe('受信詳細の描画', () => {
  const aiCandidate = candidateOf('赤い限定名刺', firstUuid, { candidate: eventOf('赤名刺', firstUuid) })
  const plainCandidate = candidateOf('青い限定名刺', secondUuid)
  const multiple: WebhookJob = { ...baseJob, candidates: [aiCandidate, plainCandidate] }

  test('webhookCandidateTitle は登録イベントの題、登録候補の題、抽出名の順', () => {
    expect(webhookCandidateTitle({ ...aiCandidate, eventTitle: '登録済みの題' })).toBe('登録済みの題')
    expect(webhookCandidateTitle(aiCandidate)).toBe('赤名刺')
    expect(webhookCandidateTitle(plainCandidate)).toBe('青い限定名刺')
  })

  test('識別されたイベントは AI の題を主表示にし、題が違う候補でも抽出名を添えない', async () => {
    const section = identifiedSection(await renderDetail(multiple))
    if (section === undefined) throw new Error('識別されたイベントの節が描画されていない')
    expect(section).toContain('赤名刺')
    // 題が付いていない候補は抽出名がそのまま主表示になる
    expect(section).toContain('青い限定名刺')
    // 題が違う候補でも、抽出名の補助表示は出さない
    expect(section).not.toContain('抽出:')
    expect(section).not.toContain('赤い限定名刺')
    // 候補名ボタンは候補ごとに1つで、行全体のクリックで選べる作りを崩さない
    const buttons = [...section.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0])
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toContain('赤名刺')
    expect(buttons[1]).toContain('青い限定名刺')
  })

  test('登録済みの候補は登録イベントの題を主表示にし、AI の題も抽出名も出さない', async () => {
    const registered = candidateOf('赤い限定名刺', firstUuid, {
      status: 'registered',
      eventId: secondUuid,
      eventTitle: '登録された赤名刺',
      candidate: eventOf('AIの赤名刺', firstUuid)
    })
    const section = identifiedSection(await renderDetail({ ...baseJob, candidates: [registered] }))
    expect(section).toContain('登録された赤名刺')
    expect(section).not.toContain('AIの赤名刺')
    expect(section).not.toContain('抽出:')
    expect(section).not.toContain('赤い限定名刺')
  })

  test('題が抽出名と同じ候補は、その名前を主表示にし、補助表示は出さない', async () => {
    const same = candidateOf('赤い限定名刺', firstUuid, { candidate: eventOf('赤い限定名刺', firstUuid) })
    const section = identifiedSection(await renderDetail({ ...baseJob, candidates: [same] }))
    expect(section).toContain('赤い限定名刺')
    expect(section).not.toContain('抽出:')
  })

  test('複数候補の保留では、「補完して登録」の遷移先が選択中の候補の題と紐付け先（投稿 ID と候補 ID）を持つ', async () => {
    const link = createLink(await renderDetail(multiple))
    expect(link?.path).toBe('/admin/events/new')
    const search = EventRequestQuerySchema.safeParse(link?.search)
    expect(search.success && search.data).toMatchObject({
      title: '赤名刺',
      category: 'limited_card',
      referenceUrls: sourceUrl,
      webhookPostId: postId,
      webhookCandidateId: firstUuid
    })
    // 投稿 ID は文字列のまま（数値に丸められない）
    expect(link?.search).toHaveProperty('webhookPostId', postId)
  })

  test('登録候補が無い候補は、下書きの定型題ではなく抽出名を作成ページの題にする', async () => {
    const draftOnly = candidateOf('青い限定名刺', secondUuid, {
      draft: {
        characterIds: [],
        title: 'アキバたん 限定名刺配布',
        category: 'limited_card',
        stores: ['akiba'],
        conditions: []
      }
    })
    const link = createLink(await renderDetail({ ...baseJob, candidates: [draftOnly] }))
    expect(link?.search).toMatchObject({ title: '青い限定名刺', category: 'limited_card', stores: 'akiba' })
    expect(link?.search).toHaveProperty('webhookCandidateId', secondUuid)
  })

  test('単一ジョブの保留では候補 ID を付けず、投稿 ID だけを渡す', async () => {
    const link = createLink(await renderDetail({ ...baseJob, candidate: eventOf('ハロウィン名刺', firstUuid) }))
    expect(link?.search).toMatchObject({ title: 'ハロウィン名刺', webhookPostId: postId })
    expect(link?.search).not.toHaveProperty('webhookCandidateId')
  })

  test.each(['queued', 'processing', 'ignored', 'failed'] as const)(
    '保留でない状態（%s）では紐付け先を渡さない',
    async (status) => {
      const single = createLink(await renderDetail({ ...baseJob, status }))
      expect(single?.search).toEqual({ referenceUrls: sourceUrl })
      const multi = createLink(
        await renderDetail({
          ...baseJob,
          candidates: [{ ...aiCandidate, status }]
        })
      )
      expect(multi?.search).not.toHaveProperty('webhookPostId')
      expect(multi?.search).not.toHaveProperty('webhookCandidateId')
    }
  )

  test('登録済みのときは「補完して登録」ではなく編集へのリンクになる', async () => {
    const markup = await renderDetail({ ...baseJob, status: 'registered', eventId: secondUuid })
    expect(createLink(markup)).toBeUndefined()
    expect(markup).toContain(`href="/admin/events/${secondUuid}/edit"`)
  })
})
