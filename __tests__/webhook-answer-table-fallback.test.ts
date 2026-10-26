import { describe, expect, test } from 'bun:test'
import { detectionStores } from '@biccame/shared/event-detect/associations'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import type { EventRequest } from '@biccame/shared/schemas/event.dto'
import { StoreKeySchema } from '@biccame/shared/schemas/store.dto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'
import { STORE_NAME_LABELS } from '@/locales/app.content'
import { draft, listJob, renderDetail } from './fixtures/webhook-management'

// 店舗・ビッカメ娘の質問（venue.* / character.*）が無い、質問の版が古い保存データ。選択式の質問（配布物）を含める。
const v2Answers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.99 },
  category: { type: 'choice', choice: 'ackey', probabilities: { ackey: 0.9, acsta: 0.1 } }
}
// 質問の版が v3 以降の保存データ。
const v3Answers: Record<string, ClefAnswer> = {
  ...v2Answers,
  'venue.funabashi': { type: 'noul', noul: 0.98 },
  'character.funato': { type: 'noul', noul: 0.99 }
}

// v13 の店舗とビッカメ娘は store / character という通常の choice 質問。
const storeChoice: ClefAnswer = {
  type: 'choice',
  choice: 'funabashi',
  probabilities: { funabashi: 0.95, akiba: 0.03, none: 0.01 }
}
const characterChoice: ClefAnswer = {
  type: 'choice',
  choice: 'funato',
  probabilities: { funato: 0.6, funabashi: 0.3, multiple: 0.05 }
}
const v13Answers: Record<string, ClefAnswer> = { ...v2Answers, store: storeChoice, character: characterChoice }

type Props = { stores?: readonly string[]; characterIds?: readonly string[]; configured?: boolean }
const render = (answers: Record<string, ClefAnswer>, { stores, characterIds, configured = true }: Props = {}) =>
  renderToStaticMarkup(
    createElement(WebhookAnswerTable, {
      answers,
      ...(configured ? { thresholds: DEFAULT_DETECTION_THRESHOLDS } : {}),
      ...(stores === undefined ? {} : { stores }),
      ...(characterIds === undefined ? {} : { characterIds })
    })
  )
const groupsOf = (markup: string) =>
  [...markup.matchAll(/<tbody\b[^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/tbody>/g)].map((match) => ({
    label: match[1],
    markup: match[2]
  }))
// 行ごとに td の属性と中身を取り出す。見出し行（th）は含めない。
const cellsOf = (markup: string | undefined) =>
  markup === undefined
    ? []
    : [...markup.matchAll(/<tr\b[^>]*>(?:(?!<\/tr>).)*?<td\b.*?<\/tr>/g)].map((row) =>
        [...row[0].matchAll(/<td\b([^>]*)>(.*?)<\/td>/g)].map((cell) => ({ attributes: cell[1], content: cell[2] }))
      )
// 行のマークアップそのもの（見出し行は含めない）。
const rowMarkupsOf = (markup: string | undefined) =>
  markup === undefined ? [] : [...markup.matchAll(/<tr\b[^>]*>(?:(?!<\/tr>).)*?<td\b.*?<\/tr>/g)].map((row) => row[0])
// 質問の列と回答の列だけを取り出す。
const pairsOf = (markup: string | undefined) => cellsOf(markup).map((cells) => [cells[0]?.content, cells[1]?.content])
const basicOf = (markup: string) => groupsOf(markup)[0]?.markup

const MONO_DASH = '<span class="font-mono tabular-nums leading-[0]">—</span>'
const STORE_ROW = '開催・配布店舗'
const CHARACTER_ROW = '対象ビッカメ娘'

describe('Clef回答表の店舗・ビッカメ娘の補い行（選択式の質問と同じ形）', () => {
  test('回答に venue.* と character.* が無いとき、基本判定の末尾に「質問 → 回答」の行を出し、見出しとグループは作らない', () => {
    const markup = render(v2Answers, { stores: ['funabashi', 'akiba'], characterIds: ['funabashi', 'other'] })
    // グループ見出し（rowgroup の th）も、店舗・ビッカメ娘のグループ（tbody）も無い。
    expect(groupsOf(markup).map((group) => group.label)).toEqual(['基本判定'])
    expect(markup).not.toContain('scope="rowgroup"')
    expect(markup).not.toContain('<th data-slot="table-head" class="px-2')
    // 既存の行（配布物 → アクキー）のあとに、同じ形の行が2つ続く。is_event（ビッカメ娘のイベントか）の行は出さない。
    expect(pairsOf(basicOf(markup))).toEqual([
      ['配布物', 'アクキー'],
      [STORE_ROW, '船橋駅FACE店、AKIBA店'],
      [CHARACTER_ROW, 'ふなたん、その他']
    ])
  })

  test('補い行の回答は「はい」ではなく名前で、質問の列は他の質問と同じ font-medium', () => {
    const rows = cellsOf(basicOf(render(v2Answers, { stores: ['funabashi'], characterIds: ['funabashi'] })))
    for (const cells of rows.slice(1)) {
      expect(cells[0]?.attributes).toContain('font-medium')
      expect(cells[1]?.content).not.toBe('はい')
    }
    // 補い行より前の行（配布物）も名前の回答で、「はい」の行は無い（is_event の行は出さない）。
    expect(rows.filter((cells) => cells[1]?.content === 'はい')).toHaveLength(0)
  })

  test('空なら回答の列は「未判定」で、行は6つのセルのまま', () => {
    const rows = cellsOf(basicOf(render(v2Answers, { stores: [], characterIds: [] })))
    expect(rows).toHaveLength(3)
    for (const cells of rows.slice(1)) expect(cells).toHaveLength(6)
    expect(pairsOf(basicOf(render(v2Answers, { stores: [], characterIds: [] }))).slice(1)).toEqual([
      [STORE_ROW, '未判定'],
      [CHARACTER_ROW, '未判定']
    ])
  })

  test('確率としきい値は text-right の td に等幅 span の — だけを置き、判定と次点は文字の —、バッジや flex や bg-warning/10 は無い', () => {
    for (const configured of [true, false]) {
      const rows = cellsOf(
        basicOf(render(v2Answers, { stores: ['funabashi'], characterIds: ['funabashi'], configured }))
      ).slice(1)
      expect(rows).toHaveLength(2)
      for (const cells of rows) {
        expect(cells).toHaveLength(6)
        for (const index of [2, 3]) {
          expect(cells[index]?.attributes).toContain('text-right')
          expect(cells[index]?.attributes).not.toContain('font-mono')
          expect(cells[index]?.content).toBe(MONO_DASH)
        }
        expect(cells[4]?.content).toBe('—')
        expect(cells[5]?.content).toBe('—')
      }
    }
    const rowMarkups = rowMarkupsOf(basicOf(render(v2Answers, { stores: ['funabashi'], characterIds: ['funabashi'] })))
    for (const row of rowMarkups.slice(1)) {
      expect(row).not.toContain('bg-warning/10')
      expect(row).not.toContain('flex')
      expect(row).not.toContain('data-slot="badge"')
    }
  })

  test('補い行の1行分のマークアップ', () => {
    const rowMarkups = rowMarkupsOf(basicOf(render(v2Answers, { stores: ['funabashi'], characterIds: [] })))
    const cell =
      'class="p-2 align-middle [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]'
    expect(rowMarkups[1]).toBe(
      '<tr data-slot="table-row" class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">' +
        `<td data-slot="table-cell" ${cell} font-medium">開催・配布店舗</td>` +
        `<td data-slot="table-cell" ${cell}">船橋駅FACE店</td>` +
        `<td data-slot="table-cell" ${cell} text-right">${MONO_DASH}</td>` +
        `<td data-slot="table-cell" ${cell} text-right text-muted-foreground">${MONO_DASH}</td>` +
        `<td data-slot="table-cell" ${cell}">—</td>` +
        `<td data-slot="table-cell" ${cell} text-muted-foreground">—</td>` +
        '</tr>'
    )
  })

  test('対象ビッカメ娘は other と secret を日本語の名前、未知のIDをIDのまま、店舗の未知のIDもIDのまま並べる', () => {
    const rows = pairsOf(
      basicOf(
        render(v2Answers, {
          stores: ['unknown_store', 'funabashi'],
          characterIds: ['funabashi', 'other', 'secret', 'unknown_id']
        })
      )
    ).slice(1)
    expect(rows).toEqual([
      [STORE_ROW, 'unknown_store、船橋駅FACE店'],
      [CHARACTER_ROW, 'ふなたん、その他、シークレット、unknown_id']
    ])
  })

  test('回答に venue.* と character.* がある（v3 以降の）ときは、補い行を足さず、渡した値によらず従来のマークアップのまま', () => {
    for (const configured of [true, false]) {
      const before = render(v3Answers, { configured })
      const after = render(v3Answers, { stores: ['akiba'], characterIds: ['funabashi', 'other'], configured })
      expect(after).toBe(before)
      // 見出しと、はい／いいえの質問の行（質問の列は名前、回答は「はい」）は従来どおり。
      expect(groupsOf(after).map((group) => group.label)).toEqual(['基本判定', STORE_ROW, CHARACTER_ROW])
      expect(after).toContain('scope="rowgroup"')
      expect(pairsOf(groupsOf(after)[1]?.markup)).toEqual([['船橋駅FACE店', 'はい']])
      expect(pairsOf(groupsOf(after)[2]?.markup)).toEqual([['ふなとーたん', 'はい']])
      expect(pairsOf(basicOf(after))).toEqual([['配布物', 'アクキー']])
      expect(after).not.toContain('未判定')
    }
  })

  test('店舗の回答（venue.*）だけがあるときは、無いビッカメ娘の行だけを基本判定の末尾に補い、見出しは回答のある店舗だけに出る', () => {
    const answers = { ...v2Answers, 'venue.funabashi': { type: 'noul' as const, noul: 0.98 } }
    const groups = groupsOf(render(answers, { stores: ['akiba'], characterIds: ['funabashi'] }))
    expect(groups.map((group) => group.label)).toEqual(['基本判定', STORE_ROW])
    expect(pairsOf(groups[0]?.markup)).toEqual([
      ['配布物', 'アクキー'],
      [CHARACTER_ROW, 'ふなたん']
    ])
    // 店舗は回答の行（98.0%）のまま、渡した店舗 akiba は出さない。
    expect(groups[1]?.markup).toContain('98.0%')
    expect(groups[1]?.markup).not.toContain('AKIBA店')
  })

  test('ビッカメ娘の回答（character.*）だけがあるときは、無い店舗の行だけを基本判定の末尾に補う', () => {
    const answers = { ...v2Answers, 'character.funato': { type: 'noul' as const, noul: 0.99 } }
    const groups = groupsOf(render(answers, { stores: ['akiba'], characterIds: ['funabashi'] }))
    expect(groups.map((group) => group.label)).toEqual(['基本判定', CHARACTER_ROW])
    expect(pairsOf(groups[0]?.markup).slice(1)).toEqual([[STORE_ROW, 'AKIBA店']])
    expect(groups[1]?.markup).toContain('ふなとーたん')
    expect(groups[1]?.markup).toContain('99.0%')
    expect(groups[1]?.markup).not.toContain('ふなたん')
  })

  test('回答の行が無いときは、店舗やビッカメ娘を渡しても「回答の記録なし」のまま表を出さない', () => {
    const markup = render({}, { stores: ['funabashi'], characterIds: ['funabashi'] })
    expect(markup).toContain('回答の記録なし')
    expect(markup).not.toContain('<table')
    expect(markup).not.toContain('ふなたん')
  })

  test('店舗とビッカメ娘を渡さないときは、回答にある行だけを出す', () => {
    const markup = render(v2Answers)
    expect(groupsOf(markup).map((group) => group.label)).toEqual(['基本判定'])
    expect(pairsOf(basicOf(markup))).toHaveLength(1)
    expect(markup).not.toContain('scope="rowgroup"')
    expect(markup).not.toContain('未判定')
  })
})

describe('回答表に出す店舗名は「ビックカメラ」を含まないアプリの短い名前', () => {
  const catalogIds = detectionStores.map((store) => store.id)
  const shortNameOf = (id: string) => {
    const parsed = StoreKeySchema.safeParse(id)
    return parsed.success ? STORE_NAME_LABELS[parsed.data] : id
  }

  test('検出カタログの全店舗がアプリの店舗名を持ち、その名前に「ビックカメラ」を含まない', () => {
    expect(catalogIds.length).toBeGreaterThan(0)
    for (const id of catalogIds) {
      expect(StoreKeySchema.safeParse(id).success).toBe(true)
      expect(shortNameOf(id)).not.toContain('ビックカメラ')
    }
  })

  test('補い行は全店舗でアプリの短い名前を「、」で並べ、表のマークアップに「ビックカメラ」が出ない', () => {
    const markup = render(v2Answers, { stores: catalogIds, characterIds: [] })
    expect(pairsOf(basicOf(markup)).slice(1)[0]).toEqual([STORE_ROW, catalogIds.map(shortNameOf).join('、')])
    expect(markup).not.toContain('ビックカメラ')
  })

  test('回答の venue.* の行も全店舗でアプリの短い名前を出し、表のマークアップに「ビックカメラ」が出ない', () => {
    const answers: Record<string, ClefAnswer> = {
      ...v2Answers,
      ...Object.fromEntries(catalogIds.map((id): [string, ClefAnswer] => [`venue.${id}`, { type: 'noul', noul: 0.98 }]))
    }
    const markup = render(answers, { stores: ['akiba'], characterIds: [] })
    expect(pairsOf(groupsOf(markup)[1]?.markup).map((pair) => pair[0])).toEqual(catalogIds.map(shortNameOf))
    expect(markup).not.toContain('ビックカメラ')
  })

  test('カタログ名が「ビックカメラ」始まりでない prosta も、アプリの短い名前で出す', () => {
    expect(detectionStores.find((store) => store.id === 'prosta')?.name).toBe('prosta')
    const answer = render({ ...v2Answers, 'venue.prosta': { type: 'noul', noul: 0.98 } })
    expect(pairsOf(groupsOf(answer)[1]?.markup)).toEqual([['池袋西口プロスタジアム', 'はい']])
    const fallback = render(v2Answers, { stores: ['prosta'], characterIds: [] })
    expect(pairsOf(basicOf(fallback)).slice(1)[0]).toEqual([STORE_ROW, '池袋西口プロスタジアム'])
  })
})

describe('受信詳細から回答表へ渡す店舗・ビッカメ娘', () => {
  const candidate: EventRequest = {
    uuid: listJob.eventUUID,
    category: 'other',
    title: '登録候補',
    stores: ['akiba'],
    characterIds: ['funato'],
    startDate: '2026-10-11T00:00:00+09:00',
    isVerified: true,
    isPreliminary: false,
    shouldTweet: true,
    conditions: [{ uuid: '11111111-1111-4111-a111-111111111111', type: 'everyone' }],
    referenceUrls: [{ uuid: '22222222-2222-4222-a222-222222222222', type: 'announce', url: listJob.sourceUrl }]
  }
  // 詳細全体の中から、回答表の基本判定の行（質問 → 回答）だけを取り出す。
  const answerPairs = (markup: string) => pairsOf(basicOf(markup.slice(markup.indexOf('aria-label="Clef の回答"'))))

  test('登録候補が無ければ下書きの店舗とビッカメ娘を旧版の回答表に出す', async () => {
    const markup = await renderDetail(
      { ...listJob, answers: v2Answers, draft: { ...draft, characterIds: ['funabashi'] } },
      0.9
    )
    expect(answerPairs(markup).slice(1)).toEqual([
      [STORE_ROW, '新宿東口駅前店'],
      [CHARACTER_ROW, 'ふなたん']
    ])
  })

  test('登録候補があれば下書きより登録候補の店舗とビッカメ娘を優先する', async () => {
    const markup = await renderDetail({ ...listJob, answers: v2Answers, candidate, draft }, 0.9)
    expect(answerPairs(markup).slice(1)).toEqual([
      [STORE_ROW, 'AKIBA店'],
      [CHARACTER_ROW, 'ふなとーたん']
    ])
  })

  test('登録候補も下書きも無ければ、旧版の回答表の店舗とビッカメ娘は未判定になる', async () => {
    const markup = await renderDetail({ ...listJob, answers: v2Answers }, 0.9)
    expect(answerPairs(markup).slice(1)).toEqual([
      [STORE_ROW, '未判定'],
      [CHARACTER_ROW, '未判定']
    ])
  })

  test('回答に venue.* と character.* がある詳細は、登録候補があっても回答の行のまま', async () => {
    const markup = await renderDetail({ ...listJob, answers: v3Answers, candidate }, 0.9)
    expect(markup).toContain('aria-label="開催・配布店舗"')
    expect(answerPairs(markup)).toHaveLength(1)
    expect(markup).not.toContain('AKIBA店')
  })

  test('回答に store と character の choice がある詳細は、登録候補があっても回答の行が 1 回ずつのまま', async () => {
    const markup = await renderDetail({ ...listJob, answers: v13Answers, candidate }, 0.9)
    expect(answerPairs(markup).slice(1)).toEqual([
      [STORE_ROW, '船橋駅FACE店'],
      [CHARACTER_ROW, 'ふなとーたん']
    ])
  })

  test('回答が無い詳細は「回答の記録なし」のまま', async () => {
    const markup = await renderDetail({ ...listJob, answers: null, draft }, 0.9)
    expect(markup).toContain('回答の記録なし')
    expect(markup).not.toContain('aria-label="Clef の回答"')
  })
})
