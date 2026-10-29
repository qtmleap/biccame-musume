import { describe, expect, test } from 'bun:test'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { webhookEventCreateSearch } from '@/components/admin/webhook-form-defaults'
import { webhookPostStatusIsTentative, webhookPostStatusLabel } from '@/components/admin/webhook-labels'
import { basicCellsOf, gridRootOf } from './fixtures/webhook-answer-grid'
import {
  answerThresholds,
  draft,
  eventNameCell,
  listJob,
  renderList,
  shintouAnswers
} from './fixtures/webhook-management'

describe('Webhook管理画面の判定・通知表示', () => {
  test('未確定の判定はしきい値の前後で切り替わる', () => {
    const job = { postStatus: 'announce', postStatusProbability: 0.7499 } as const
    expect(webhookPostStatusIsTentative(job, 0.9)).toBe(true)
    expect(webhookPostStatusIsTentative({ ...job, postStatusProbability: 0.8999 }, 0.9)).toBe(true)
    expect(webhookPostStatusIsTentative({ ...job, postStatusProbability: 0.9 }, 0.9)).toBe(false)
    expect(webhookPostStatusIsTentative({ ...job, postStatusProbability: 0.95 }, 0.9)).toBe(false)
    expect(webhookPostStatusIsTentative({ postStatus: null, postStatusProbability: null }, 0.9)).toBe(false)
    expect(webhookPostStatusIsTentative({ postStatus: 'announce', postStatusProbability: null }, 0.9)).toBe(false)
  })

  test('投稿状態ラベルは確率があってもラベルだけ、対象外は却下を優先する', () => {
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'announce', postStatusProbability: 0.7499 })).toBe(
      '告知'
    )
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'end', postStatusProbability: 0 })).toBe('終了')
    expect(webhookPostStatusLabel({ status: 'held', postStatus: 'start', postStatusProbability: null })).toBe('開始')
    expect(webhookPostStatusLabel({ status: 'held', postStatus: null, postStatusProbability: null })).toBe('—')
    expect(webhookPostStatusLabel({ status: 'ignored', postStatus: 'end', postStatusProbability: 1 })).toBe('却下')
  })

  test('未登録でAIの下書きタイトルがある行は候補として薄く表示する', async () => {
    const markup = await renderList([{ ...listJob, eventId: null, eventTitle: null, draft }])
    const cell = eventNameCell(markup)
    expect(cell).toContain('新東たん アクリルスタンド配布')
    expect(cell).toContain('text-muted-foreground')
    expect(cell).toContain('>候補</span>')
    expect(cell).toContain('title="AIの下書き。未登録"')
    expect(cell).not.toContain('<a')
    expect(markup).not.toContain('href="/events/')
  })

  test('全セルの中身は行内の基線に乗せず、上下中央に揃える', async () => {
    const markup = await renderList(
      [
        { ...listJob, eventId: null, eventTitle: null, draft },
        { ...listJob, postId: '1000000000000000002', postStatus: 'announce', postStatusProbability: 0.7499 }
      ],
      0.9
    )
    const rows = [...markup.matchAll(/<tr\b[^>]*>.*?<\/tr>/g)]
      .map((match) => match[0])
      .filter((row) => row.includes('<td'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const cells = [...row.matchAll(/<td\b[^>]*>.*?<\/td>/g)].map((match) => match[0])
      expect(cells).toHaveLength(9)
      // ui/table の TableCell が align-middle を持ち、セル直下の要素に inline-flex を使わない。
      // （Badge は inline-flex を持つが、flex コンテナ内では flex アイテムになり基線に乗らない。）
      for (const cell of cells) {
        expect(cell).toContain('align-middle')
        expect(cell).not.toMatch(/^<td\b[^>]*>\s*<[a-z]+\b[^>]*class="[^"]*inline-flex/)
      }
      // アカウント列のリンクはブロックのflexにして、アバターを上下中央に揃える。
      const link = cells[0]?.match(/<a\b[^>]*class="([^"]*)"/)?.[1]
      expect(link?.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center']))
    }
    // 下書きタイトルと「候補」バッジは同じ行に並べ、折り返さない。
    const draftRow = rows[0]?.match(/<div\b[^>]*class="([^"]*)"[^>]*>新東たん/)?.[1]
    expect(draftRow?.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center', 'whitespace-nowrap']))
    // 未確定のステータスにtitleとmutedを付けても、セルのalign-middleは保たれる。
    const status = rows[1] === undefined ? undefined : [...rows[1].matchAll(/<td\b[^>]*>.*?<\/td>/g)][6]?.[0]
    expect(status).toContain('align-middle')
    expect(status).toContain('text-muted-foreground')
    expect(status).toContain('title=')
  })

  test('登録済みリンクは下書きより優先し、タイトルの無い下書きは—を表示する', async () => {
    const linked = await renderList([{ ...listJob, draft }])
    expect(eventNameCell(linked)).toContain(`href="/events/${listJob.eventId}"`)
    expect(eventNameCell(linked)).not.toContain('候補')
    expect(linked).not.toContain('新東たん アクリルスタンド配布')
    const untitled = await renderList([
      { ...listJob, eventId: null, eventTitle: null, draft: { characterIds: [], stores: [], conditions: [] } }
    ])
    expect(eventNameCell(untitled)).toContain('>—</td>')
    expect(untitled).not.toContain('候補')
  })

  test('イベント作成ページへ渡すクエリは登録候補を優先し、無ければ下書きから作り、元投稿URLは常に渡す', () => {
    const none = webhookEventCreateSearch(listJob)
    expect(none).toEqual({ referenceUrls: listJob.sourceUrl })
    for (const key of ['title', 'category', 'stores', 'startDate', 'endDate']) expect(none).not.toHaveProperty(key)
    const filled = webhookEventCreateSearch({
      ...listJob,
      draft: {
        characterIds: [],
        title: '新東たん アクリルスタンド配布',
        category: 'acsta',
        stores: ['shintou', 'not-a-store'],
        startDate: '2026-10-19',
        endDate: '2026-10-25',
        conditions: [{ type: 'purchase', purchaseAmount: 1000 }],
        limitedQuantity: 100
      }
    })
    expect(filled).toEqual({
      title: '新東たん アクリルスタンド配布',
      category: 'acsta',
      stores: 'shintou',
      startDate: '2026-10-19',
      endDate: '2026-10-25',
      referenceUrls: listJob.sourceUrl
    })
    // 作成ページのクエリで渡せない配布条件と数量は含めない。
    expect(filled).not.toHaveProperty('conditions')
    expect(filled).not.toHaveProperty('limitedQuantity')
    // 下書きの空の項目はキーごと省略し、有効な店舗が無ければ stores も省略する。
    const sparse = webhookEventCreateSearch({
      ...listJob,
      draft: { characterIds: [], stores: ['not-a-store'], conditions: [] }
    })
    expect(sparse).toEqual({ referenceUrls: listJob.sourceUrl })
    const candidate: EventRequest = {
      uuid: listJob.eventUUID,
      category: 'other',
      title: '登録候補',
      stores: ['akiba'],
      characterIds: ['akiba'],
      startDate: '2026-10-11T00:00:00+09:00',
      isVerified: true,
      isPreliminary: false,
      shouldTweet: true,
      conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
      referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: listJob.sourceUrl }]
    }
    const fromCandidate = webhookEventCreateSearch({ ...listJob, candidate, draft })
    expect(fromCandidate).toEqual({
      title: '登録候補',
      category: 'other',
      stores: 'akiba',
      characterIds: 'akiba',
      startDate: '2026-10-11',
      referenceUrls: listJob.sourceUrl
    })
    expect(fromCandidate).not.toHaveProperty('endDate')
    // 終了日は JST の日付にそろえる。複数店舗はカンマ区切り。
    expect(
      webhookEventCreateSearch({
        ...listJob,
        candidate: {
          ...candidate,
          stores: ['akiba', 'shintou'],
          characterIds: ['funato', 'kawasaki'],
          endDate: '2026-10-25T23:59:59+09:00'
        }
      })
    ).toMatchObject({
      stores: 'akiba,shintou',
      characterIds: 'funato,kawasaki',
      startDate: '2026-10-11',
      endDate: '2026-10-25'
    })
  })

  test('Clef の回答表は質問ごとに1セル、確定と未確定をバッジで区別する', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    // Grid には列見出しも table のタグも無い。ラベル・ステータス・回答・確率・補足が各セルの欄になる。
    expect(markup).not.toContain('<th')
    expect(markup).not.toContain('<table')
    const cells = basicCellsOf(markup)
    // is_event（ビッカメ娘のイベントか）は回答に入っていてもセルを出さない。
    expect(cells).toHaveLength(4)
    expect(cells.map((cell) => cell.label)).toEqual(['状態', '配布物', '開始日', '配布条件'])
    expect(cells.map((cell) => cell.status)).toEqual(['未確定', '未確定', '確定', '確定'])
    expect(markup.match(/data-slot="badge"/g)).toHaveLength(4)
    expect(cells[0]).toMatchObject({ answer: '告知', probability: '75.0%' })
    expect(cells[0]?.note).toBe('しきい値 80.0% · 次点 開始 15.0% / 状態なし 5.0%')
    expect(markup).toContain('2026-10-19')
    expect(markup).not.toContain('72.2%')
    expect(markup).toContain('90.0%')
    expect(markup).toContain('しきい値は現在の設定です。判定した時点の設定と異なる場合があります。')
  })

  test('確定はtheme トークンの success、未確定は warning で表し、未確定のセルだけ薄く強調する', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    const cells = basicCellsOf(markup)
    expect(cells.filter((cell) => cell.className.includes('bg-warning/10'))).toHaveLength(2)
    expect(cells.filter((cell) => cell.html.includes('border-success/50'))).toHaveLength(2)
    expect(cells.filter((cell) => cell.html.includes('border-warning/60'))).toHaveLength(2)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/)
  })

  test('回答表の確率は右寄せのmono、しきい値が無い間はしきい値とステータスに—を出す', () => {
    const loading = renderToStaticMarkup(createElement(WebhookAnswerTable, { answers: shintouAnswers }))
    const cells = basicCellsOf(loading)
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expect(cell.status).toBe('—')
      expect(cell.note).toContain('しきい値 —')
      expect(cell.note).not.toMatch(/しきい値 \d/)
      const probability = gridRootOf(loading)?.querySelector(`[data-key="${cell.key}"] [data-field="probability"]`)
      expect(probability?.getAttribute('class')?.split(' ')).toEqual(
        expect.arrayContaining(['font-mono', 'tabular-nums', 'text-right'])
      )
    }
    expect(loading).not.toContain('data-slot="badge"')
    expect(loading).not.toContain('bg-warning/10')
  })

  // セルの1行目・2行目は items-baseline の flex にして、日本語と等幅の数値の基線を揃える。等幅は数値の span にだけ付ける。
  test('回答表の確率としきい値は、セルではなく内側の span が font-mono と tabular-nums を持つ', () => {
    for (const thresholds of [answerThresholds, undefined]) {
      const markup = renderToStaticMarkup(createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds }))
      const root = gridRootOf(markup)
      if (root === null) throw new Error('Missing grid root')
      for (const cell of root.querySelectorAll('li[data-key]')) {
        expect(cell.getAttribute('class')).not.toContain('font-mono')
        expect(cell.getAttribute('class')).not.toContain('tabular-nums')
        const probability = cell.querySelector('[data-field="probability"]')
        expect(probability?.getAttribute('class')).toContain('font-mono')
        expect(probability?.getAttribute('class')).toContain('tabular-nums')
        for (const line of cell.querySelectorAll(':scope > div'))
          expect(line.getAttribute('class')).toContain('items-baseline')
      }
    }
  })

  test('回答表の次点は、補足の行に「次点 回答 確率」を「 / 」で並べ、確率だけを等幅 span にする', () => {
    const markup = renderToStaticMarkup(
      createElement(WebhookAnswerTable, { answers: shintouAnswers, thresholds: answerThresholds })
    )
    const notes = basicCellsOf(markup).map((cell) => cell.note)
    expect(notes).toEqual([
      'しきい値 80.0% · 次点 開始 15.0% / 状態なし 5.0%',
      'しきい値 90.0% · 次点 アクキー 42.8% / その他 9.0%',
      'しきい値 90.0% · 次点 なし 0.4%',
      'しきい値 90.0% · 次点 確定できない 1.0%'
    ])
    // 次点が2件ある行（状態・配布物）は ' / ' で区切る。
    expect(notes.filter((note) => note?.includes(' / '))).toHaveLength(2)
    const root = gridRootOf(markup)
    if (root === null) throw new Error('Missing grid root')
    const monos = root.querySelectorAll('[data-field="note"] span')
    expect(monos.length).toBeGreaterThan(0)
    for (const mono of monos) {
      expect(mono.getAttribute('class')).toBe('font-mono tabular-nums')
      expect(mono.text).toMatch(/^[\d.]+%$/)
    }
  })
})
