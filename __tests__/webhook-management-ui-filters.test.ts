import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { type WebhookJob, WebhookPostStatusFilterSchema } from '@biccame/shared/schemas/webhook.dto'
import { INITIAL_WEBHOOK_FILTER, NO_WEBHOOK_FILTER, type WebhookFilter } from '@/atoms/webhook-filter-atom'
import {
  webhookAccountLabel,
  webhookCandidateTitle,
  webhookPostStatusFilterLabel,
  webhookPostStatusLabel
} from '@/components/admin/webhook-labels'
import { webhookJobListQueryKey } from '@/hooks/use-admin-webhooks'
import { basicCellsOf } from './fixtures/webhook-answer-grid'
import {
  characters,
  eventNameCell,
  listJob,
  outlineTags,
  renderDetail,
  renderList,
  statusCell
} from './fixtures/webhook-management'

describe('受信履歴の絞り込みツールバーと並べ替え', () => {
  const toolbar = (markup: string) => markup.match(/<fieldset\b[^>]*aria-label="絞り込み"[^>]*>.*?<\/fieldset>/)?.[0]
  const confidenceHeader = (markup: string) =>
    [...markup.matchAll(/<th\b[^>]*>.*?<\/th>/g)].map((match) => match[0]).find((cell) => cell.includes('>精度'))
  // 条件なし（NO_WEBHOOK_FILTER）を土台に上書きする。既定（判定は一致）が混ざると、判定の違いが検証から消えるため。
  const filterWith = (overrides: Partial<WebhookFilter>): WebhookFilter => ({ ...NO_WEBHOOK_FILTER, ...overrides })
  const selectValues = (bar: string | undefined) =>
    bar === undefined ? [] : [...bar.matchAll(/data-slot="select-value"[^>]*>(.*?)<\/span>/g)].map((match) => match[1])

  test('表の上に、期間・判定・ステータス・条件をクリアをこの順で同じ場所に出し、精度の絞り込みは出さない', async () => {
    const markup = await renderList([listJob], 0.9)
    const bar = toolbar(markup)
    expect(bar).toBeDefined()
    const labels = [
      'aria-label="ビッカメ娘"',
      'aria-label="検出結果"',
      'aria-label="期間"',
      'aria-label="判定"',
      'aria-label="ステータス"',
      '条件をクリア'
    ]
    for (const label of labels) expect(bar).toContain(label)
    expect(bar).toContain('>ビッカメ娘</span>')
    expect(bar).not.toContain('キャラクター')
    const positions = labels.map((label) => (bar === undefined ? -1 : bar.indexOf(label)))
    expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    // 精度の絞り込み（下限・上限の入力欄）は無い。精度は並べ替えだけ。
    expect(bar).not.toContain('aria-label="精度 下限 %"')
    expect(bar).not.toContain('aria-label="精度 上限 %"')
    expect(bar).not.toContain('<input')
    expect(markup).not.toContain('aria-label="精度 下限 %"')
    expect(markup).not.toContain('aria-label="精度 上限 %"')
    // ツールバーは表より前にある。
    expect(markup.indexOf('aria-label="絞り込み"')).toBeLessThan(markup.indexOf('<table'))
    // 既定の選択は、期間は「すべて」、判定は「一致」、ステータスは「すべて」。
    expect(selectValues(bar)).toEqual(['すべて', 'すべて', 'すべて', '一致', 'すべて'])
  })

  test('選択したキャラクターをアカウント列と同じ名前で表示する', async () => {
    const filter = filterWith({ screenName: 'bic_abeno' })
    const bar = toolbar(await renderList([listJob], 0.9, undefined, { filter }))
    expect(selectValues(bar)).toEqual([
      webhookAccountLabel('bic_abeno', characters),
      'すべて',
      'すべて',
      'すべて',
      'すべて'
    ])
    expect(webhookJobListQueryKey(null, filter)).not.toEqual(webhookJobListQueryKey(null, NO_WEBHOOK_FILTER))
  })

  test('ステータスの選択肢は 告知・開始・継続・終了・却下 で、列の表示と同じ文言を使う', () => {
    const labels = WebhookPostStatusFilterSchema.options.map(webhookPostStatusFilterLabel)
    expect(labels).toEqual(['告知', '開始', '継続', '終了', '却下'])
    // 一覧の「ステータス」列（webhookPostStatusLabel）と同じ表示。却下はジョブの状態が最優先。
    const base = { status: 'registered', postStatusProbability: 0.9 } as const
    expect(
      (['announce', 'start', 'ongoing', 'end'] as const).map((postStatus) =>
        webhookPostStatusLabel({ ...base, postStatus })
      )
    ).toEqual(labels.slice(0, 4))
    expect(webhookPostStatusLabel({ ...base, status: 'ignored', postStatus: 'announce' })).toBe(labels[4])
  })

  test('条件なし（判定が null）の絞り込みでは、判定を既定の一致に戻さず「すべて」と表示する', async () => {
    const bar = toolbar(await renderList([listJob], 0.9, undefined, { filter: NO_WEBHOOK_FILTER }))
    expect(selectValues(bar)).toEqual(['すべて', 'すべて', 'すべて', 'すべて', 'すべて'])
  })

  test('絞り込みの値は選択中の表示に出す', async () => {
    const filter = filterWith({ range: '24h', verdict: 'excluded', postStatus: 'ongoing' })
    const bar = toolbar(await renderList([listJob], 0.9, undefined, { filter }))
    expect(selectValues(bar)).toEqual(['すべて', 'すべて', '直近24時間', '除外', '継続'])
    for (const [postStatus, label] of [
      ['announce', '告知'],
      ['start', '開始'],
      ['end', '終了'],
      ['ignored', '却下']
    ] as const) {
      const other = toolbar(await renderList([listJob], 0.9, undefined, { filter: filterWith({ postStatus }) }))
      expect(selectValues(other)).toEqual(['すべて', 'すべて', 'すべて', 'すべて', label])
    }
  })

  test('「条件をクリア」は常に出し、外せる条件が無い（NO_WEBHOOK_FILTER）ときだけ disabled にする', async () => {
    const clearButton = (markup: string) =>
      [...markup.matchAll(/<button\b[^>]*>.*?<\/button>/g)]
        .map((match) => match[0])
        .find((tag) => tag.includes('条件をクリア'))
    // 既定は判定が一致なので、外せる条件がある。押せる。
    const initial = clearButton(await renderList([listJob], 0.9))
    expect(initial).toBeDefined()
    expect(initial).not.toContain('disabled=""')
    expect(initial).toContain('border-card-border')
    // 条件が何も無ければ押せない。
    const none = clearButton(await renderList([listJob], 0.9, undefined, { filter: NO_WEBHOOK_FILTER }))
    expect(none).toContain('disabled=""')
    expect(none).toContain('border-card-border')
    for (const filter of [
      INITIAL_WEBHOOK_FILTER,
      filterWith({ range: '1h' }),
      filterWith({ verdict: 'match' }),
      filterWith({ verdict: 'excluded' }),
      filterWith({ postStatus: 'announce' }),
      filterWith({ postStatus: 'ignored' }),
      filterWith({ sort: 'confidence', order: 'desc' }),
      filterWith({ sort: 'confidence', order: 'asc' })
    ]) {
      const active = clearButton(await renderList([listJob], 0.9, undefined, { filter }))
      expect(active).toBeDefined()
      expect(active).not.toContain('disabled=""')
    }
  })

  test('精度の見出しはボタンで、並べ替えの向きを aria-sort と矢印アイコンで示す', async () => {
    const cases = [
      [INITIAL_WEBHOOK_FILTER, 'none', 'lucide-arrow-up-down'],
      [filterWith({ sort: 'confidence', order: 'desc' }), 'descending', 'lucide-arrow-down'],
      [filterWith({ sort: 'confidence', order: 'asc' }), 'ascending', 'lucide-arrow-up']
    ] as const
    for (const [filter, ariaSort, icon] of cases) {
      const header = confidenceHeader(await renderList([listJob], 0.9, undefined, { filter }))
      expect(header).toContain(`aria-sort="${ariaSort}"`)
      expect(header).toContain('<button')
      expect(header).toContain(icon)
      // 矢印アイコンは装飾。ボタンの名前は「精度」だけ。
      expect(header).toContain('aria-hidden="true"')
      expect(header).toMatch(/>精度<svg/)
    }
  })

  test('精度の見出しボタンは行内で右寄せの数値列に揃い、操作の説明を title に持つ', async () => {
    const header = confidenceHeader(await renderList([listJob], 0.9))
    expect(header).toContain('aria-sort="none"')
    expect(header).toContain('text-right')
    expect(header).toContain('title="精度の高い順に並べ替え"')
    const high = confidenceHeader(
      await renderList([listJob], 0.9, undefined, { filter: filterWith({ sort: 'confidence', order: 'desc' }) })
    )
    expect(high).toContain('title="精度の低い順に並べ替え"')
    const low = confidenceHeader(
      await renderList([listJob], 0.9, undefined, { filter: filterWith({ sort: 'confidence', order: 'asc' }) })
    )
    expect(low).toContain('title="日時の新しい順に戻す"')
  })

  test('0件でも先があるときは続きを検索できる旨を、先が無いときは従来の文言を出す', async () => {
    const more = await renderList([], 0.9, undefined, { nextCursor: '1000000000000000001' })
    expect(more).toContain('この範囲には条件に合う履歴がありません。「次へ」で続きを検索できます。')
    expect(more).not.toContain('受信履歴はありません。')
    const none = await renderList([], 0.9)
    expect(none).toContain('受信履歴はありません。')
    expect(none).not.toContain('続きを検索できます')
    // どちらも8列をまたぐ。
    expect(more).toContain('colSpan="9"')
  })

  test('更新・前へ・次へと同じく、ツールバーのボタンも枠線色は共通テーマ色', async () => {
    const bar = toolbar(await renderList([listJob], 0.9))
    expect(bar).toBeDefined()
    for (const tag of outlineTags(bar === undefined ? '' : bar)) expect(tag).toContain('border-card-border')
  })
})

describe('候補の表示名', () => {
  const baseCandidate = {
    eventTitle: null,
    candidate: null,
    item: 'ハロウィン限定名刺'
  } as const
  const registeredRequest: EventRequest = {
    uuid: listJob.eventUUID,
    category: 'limited_card',
    title: 'AI が付けた題',
    stores: ['akiba'],
    characterIds: ['akiba'],
    startDate: '2026-10-11T00:00:00+09:00',
    isVerified: true,
    isPreliminary: false,
    shouldTweet: false,
    conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
    referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: listJob.sourceUrl }]
  }

  test('登録済みなら登録イベントの題、無ければ保存済みの登録候補の題、無ければ抽出名の順で選ぶ', () => {
    expect(
      webhookCandidateTitle({ ...baseCandidate, eventTitle: '実際のイベント名', candidate: registeredRequest })
    ).toBe('実際のイベント名')
    expect(webhookCandidateTitle({ ...baseCandidate, candidate: registeredRequest })).toBe('AI が付けた題')
    expect(webhookCandidateTitle(baseCandidate)).toBe('ハロウィン限定名刺')
  })

  test('一覧は登録済みのリンクにも未登録の行にも同じ表示名を使う', async () => {
    const candidates = [
      {
        ...listJob,
        item: '抽出名のみ',
        storeKey: 'akiba',
        status: 'held' as const,
        eventId: null,
        eventTitle: null,
        candidate: null
      },
      {
        ...listJob,
        item: '登録候補あり',
        storeKey: 'akiba',
        status: 'held' as const,
        eventUUID: '550e8400-e29b-41d4-a716-446655440003',
        eventId: null,
        eventTitle: null,
        candidate: registeredRequest
      },
      {
        ...listJob,
        item: '登録済み',
        storeKey: 'akiba',
        status: 'registered' as const,
        eventUUID: '550e8400-e29b-41d4-a716-446655440004',
        eventTitle: '紐付け先の実イベント名'
      }
    ]
    const markup = await renderList([{ ...listJob, candidates }])
    const cell = eventNameCell(markup)
    // 抽出名のみ → 抽出名、登録候補あり → AI が付けた題(抽出名ではない)、登録済み → 登録イベントの題。
    expect(cell).toContain('<span>抽出名のみ</span>')
    expect(cell).toContain('<span>AI が付けた題</span>')
    expect(cell).not.toContain('登録候補あり')
    expect(cell).toMatch(
      /<a\b[^>]*href="\/events\/550e8400-e29b-41d4-a716-446655440000"[^>]*>紐付け先の実イベント名<\/a>/
    )
    expect(cell).not.toContain('<span>登録済み</span>')
  })
})

describe('項目別のしきい値の反映', () => {
  const announce = (probability: number): WebhookJob => ({
    ...listJob,
    postStatus: 'announce',
    postStatusProbability: probability
  })

  test('受信履歴の未確定は status の項目別しきい値（共通値ではない）で決まる', async () => {
    // 共通値 90% でも、status が 80% なら 0.85 は確定として通常表示する。
    const confirmed = await renderList([announce(0.85)], 0.9, { status: 0.8 })
    expect(statusCell(confirmed)).toContain('>告知</td>')
    expect(statusCell(confirmed)).not.toContain('text-muted-foreground')
    expect(statusCell(confirmed)).not.toContain('title=')
    // status を 90% にすると、同じ 0.85 が未確定になり、理由に status のしきい値を出す。
    const tentative = await renderList([announce(0.85)], 0.9, { status: 0.9 })
    expect(statusCell(tentative)).toContain('text-muted-foreground')
    expect(statusCell(tentative)).toContain('title="確信度がしきい値(90%)未満のため未確定"')
    const below = await renderList([announce(0.79)], 0.9, { status: 0.8 })
    expect(statusCell(below)).toContain('title="確信度がしきい値(80%)未満のため未確定"')
    // 他の項目のしきい値は一覧の未確定に影響しない。
    const other = await renderList([announce(0.85)], 0.9, { status: 0.8, category: 0.99 })
    expect(statusCell(other)).not.toContain('title=')
  })

  test('受信詳細の回答表は項目別のしきい値と確定を出す（状態 80%、配布物 90%）', async () => {
    const answers: Record<string, ClefAnswer> = {
      status: { type: 'choice', choice: 'announce', probabilities: { announce: 0.8536, start: 0.1 } },
      category: { type: 'choice', choice: 'other', probabilities: { other: 0.85, none: 0.1 } }
    }
    const markup = await renderDetail({ ...listJob, answers }, 0.9, { status: 0.8 })
    const cellOf = (label: string) => {
      const cell = basicCellsOf(markup).find((entry) => entry.label === label)
      if (cell === undefined) throw new Error(`Missing cell ${label}`)
      return cell
    }
    expect(cellOf('状態').note).toContain('しきい値 80.0%')
    expect(cellOf('状態').status).toBe('確定')
    expect(cellOf('配布物').note).toContain('しきい値 90.0%')
    expect(cellOf('配布物').status).toBe('未確定')
  })
})

test('一覧と詳細は一部登録・一部保留を配布物ごとに表示し、元投稿を維持する', async () => {
  const candidates = [
    {
      ...listJob,
      item: 'ハロウィン限定名刺',
      storeKey: 'akiba',
      status: 'held' as const,
      eventId: null,
      eventTitle: null,
      post: { ...listJob.post, text: '名刺に関する原文断片' }
    },
    {
      ...listJob,
      item: 'ハロウィンアクキー',
      storeKey: 'akiba',
      status: 'registered' as const,
      eventUUID: '550e8400-e29b-41d4-a716-446655440002',
      eventTitle: 'ハロウィンアクキー'
    }
  ]
  const job: WebhookJob = { ...listJob, candidates, post: { ...listJob.post, text: 'アクキーと名刺の元投稿全文' } }
  const list = await renderList([job])
  expect(list).toContain('ハロウィン限定名刺')
  expect(list).toContain('ハロウィンアクキー')
  const cell = eventNameCell(list)
  expect(cell).toContain('title="登録済み"')
  expect(cell).toContain('title="保留"')
  expect(cell).toContain('<span class="sr-only">登録済み</span>')
  expect(cell).toContain('<span class="sr-only">保留</span>')
  const detail = await renderDetail(job)
  expect(detail).toContain('識別されたイベント')
  expect(detail).toContain('aria-pressed="true"')
  expect(detail).toContain('aria-pressed="false"')
  expect(detail).toContain('アクキーと名刺の元投稿全文')
  expect(detail).not.toContain('名刺に関する原文断片')
  // 「登録イベント」リンクは編集画面ではなくイベント詳細ページへ向ける。
  expect(detail).toContain('href="/events/550e8400-e29b-41d4-a716-446655440000"')
  expect(detail).not.toMatch(/\/admin\/events\/(?!new)/)
  for (const label of ['補完して登録', '連携', '対象外にする', '再実行', '通知を再送']) expect(detail).toContain(label)
})
