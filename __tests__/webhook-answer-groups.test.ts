import { describe, expect, test } from 'bun:test'
import type { ClefAnswer } from '@biccame/shared/event-detect/clef'
import { DEFAULT_DETECTION_THRESHOLDS } from '@biccame/shared/event-detect/detection'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebhookAnswerTable } from '@/components/admin/webhook-answer-table'

const answers: Record<string, ClefAnswer> = {
  'character.funato': { type: 'noul', noul: 0.99 },
  'venue.funabashi': { type: 'noul', noul: 0.98 },
  is_event: { type: 'noul', noul: 0.99 },
  'character.funabashi': { type: 'noul', noul: 0.01 },
  'venue.akiba': { type: 'noul', noul: 0.02 },
  unknown_question: { type: 'score', score: 3 }
}
const render = (values = answers, configured = true) =>
  renderToStaticMarkup(
    createElement(WebhookAnswerTable, {
      answers: values,
      ...(configured ? { thresholds: DEFAULT_DETECTION_THRESHOLDS } : {})
    })
  )
const groupsOf = (markup: string) =>
  [...markup.matchAll(/<tbody\b[^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/tbody>/g)].map((match) => ({
    label: match[1],
    markup: match[2]
  }))

describe('Clef回答の独立グループ表示', () => {
  test('保存順が混ざっていても、基本判定・開催配布店舗・対象ビッカメ娘を別のrowgroupで表示する', () => {
    const groups = groupsOf(render())
    expect(groups.map((group) => group.label)).toEqual(['基本判定', '開催・配布店舗', '対象ビッカメ娘'])
    for (const group of groups) {
      expect(group.markup).toContain('scope="rowgroup"')
      expect(group.markup).toContain('colSpan="6"')
    }
    expect(groups[0]?.markup).toContain('ビッカメ娘のイベントか')
    expect(groups[0]?.markup).toContain('unknown_question')
    expect(groups[1]?.markup).toContain('船橋駅FACE店')
    // 検出用カタログの名前（ビックカメラ…）ではなく、アプリの短い店舗名で出す。
    expect(groups[1]?.markup).not.toContain('ビックカメラ')
    expect(groups[1]?.markup).not.toContain('開催店舗:')
    expect(groups[1]?.markup).not.toContain('対象ビッカメ娘:')
    expect(groups[2]?.markup).not.toContain('対象ビッカメ娘:')
    expect(groups[2]?.markup).toContain('ふなとーたん')
    expect(groups[2]?.markup).not.toContain('ふなたん')
    expect(groups[2]?.markup).not.toContain('開催店舗:')
  })

  test('基本判定を保ち、店舗とビッカメ娘の否定回答だけを非表示にする', () => {
    const markup = render()
    const rows = [...markup.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/g)].filter((match) => match[1]?.includes('<td'))
    expect(rows).toHaveLength(4)
    expect(markup).not.toContain('AKIBA店')
    expect(answers['venue.akiba']).toEqual({ type: 'noul', noul: 0.02 })
    expect(answers['character.funabashi']).toEqual({ type: 'noul', noul: 0.01 })
    expect(markup).toContain('99.0%')
    expect(markup).toContain('98.0%')
    expect(markup).toContain('いいえ')
    expect(markup).toContain('確定')
    for (const row of rows) expect([...row[0].matchAll(/<td\b/g)]).toHaveLength(6)
  })

  test('店舗のみ・ビッカメ娘のみの場合は空グループを表示しない', () => {
    expect(groupsOf(render({ 'venue.funabashi': { type: 'noul', noul: 0.98 } })).map((group) => group.label)).toEqual([
      '開催・配布店舗'
    ])
    expect(groupsOf(render({ 'character.funato': { type: 'noul', noul: 0.99 } })).map((group) => group.label)).toEqual([
      '対象ビッカメ娘'
    ])
  })

  test('肯定が無いグループは該当なしと表示し、低確率の肯定は未確定で残す', () => {
    const groups = groupsOf(
      render({
        'venue.akiba': { type: 'noul', noul: 0.01 },
        'character.funato': { type: 'noul', noul: 0.719 },
        'character.funabashi': { type: 'noul', noul: 0.02 }
      })
    )
    expect(groups[0]?.markup).toContain('該当なし')
    expect(groups[0]?.markup).not.toContain('開催店舗:')
    expect(groups[1]?.markup).toContain('ふなとーたん')
    expect(groups[1]?.markup).toContain('71.9%')
    expect(groups[1]?.markup).toContain('未確定')
    expect(groups[1]?.markup).not.toContain('ふなたん')
  })

  test('しきい値未取得でもグループを維持し、推測した確定バッジを表示しない', () => {
    const markup = render(answers, false)
    expect(groupsOf(markup)).toHaveLength(3)
    expect(markup).not.toContain('data-slot="badge"')
    expect(markup).not.toContain('bg-warning/10')
  })

  test('旧版の回答は質問を増やさず従来の表示を保つ', () => {
    const markup = render({
      store: { type: 'choice', choice: 'none', probabilities: { none: 0.99 } },
      is_event: { type: 'noul', noul: 0.99 }
    })
    expect(groupsOf(markup).map((group) => group.label)).toEqual(['基本判定'])
    expect(markup).toContain('店舗なし')
    expect(markup).not.toContain('scope="rowgroup"')
    expect(markup).not.toContain('対象ビッカメ娘:')
  })
})

// 店舗・ビッカメ娘の質問（venue.* / character.*）が無い、質問の版が古い保存データ。選択式の質問（配布物）を含める。
const v2Answers: Record<string, ClefAnswer> = {
  is_event: { type: 'noul', noul: 0.99 },
  category: { type: 'choice', choice: 'ackey', probabilities: { ackey: 0.9, acsta: 0.1 } }
}
// v13 の店舗とビッカメ娘は store / character という通常の choice 質問。v2 の保存データにも store の choice がある。
const choiceOf = (choice: string, probabilities: Record<string, number>): ClefAnswer => ({
  type: 'choice',
  choice,
  probabilities
})
const noulOf = (noul: number): ClefAnswer => ({ type: 'noul', noul })
const storeChoice = choiceOf('funabashi', { funabashi: 0.95, akiba: 0.03, none: 0.01 })
const characterChoice = choiceOf('funato', { funato: 0.6, funabashi: 0.3, multiple: 0.05 })
const v13Answers: Record<string, ClefAnswer> = { ...v2Answers, store: storeChoice, character: characterChoice }
// ローカルのジョブ 2112435987582513432 のように、store の回答が無い 8 問だけの v2 の保存データ。
const v2Eight: Record<string, ClefAnswer> = {
  ...v2Answers,
  status: choiceOf('announce', { announce: 0.9, start: 0.1 }),
  single_event: noulOf(0.97),
  start_date: choiceOf('d20261103', { d20261103: 0.9, none: 0.1 }),
  end_date: choiceOf('none', { none: 0.95 }),
  condition: choiceOf('everyone', { everyone: 0.9, none: 0.1 }),
  quantity: choiceOf('q100', { q100: 0.9, none: 0.1 })
}

type RenderProps = { stores?: readonly string[]; characterIds?: readonly string[]; configured?: boolean }
const renderWith = (
  answers: Record<string, ClefAnswer>,
  { stores, characterIds, configured = true }: RenderProps = {}
) =>
  renderToStaticMarkup(
    createElement(WebhookAnswerTable, {
      answers,
      ...(configured ? { thresholds: DEFAULT_DETECTION_THRESHOLDS } : {}),
      ...(stores === undefined ? {} : { stores }),
      ...(characterIds === undefined ? {} : { characterIds })
    })
  )
// 行ごとに td の属性と中身を取り出す。見出し行（th）は含めない。
const cellsOf = (markup: string | undefined) =>
  markup === undefined
    ? []
    : [...markup.matchAll(/<tr\b[^>]*>(?:(?!<\/tr>).)*?<td\b.*?<\/tr>/g)].map((row) =>
        [...row[0].matchAll(/<td\b([^>]*)>(.*?)<\/td>/g)].map((cell) => ({ attributes: cell[1], content: cell[2] }))
      )
// 質問の列と回答の列だけを取り出す。
const pairsOf = (markup: string | undefined) => cellsOf(markup).map((cells) => [cells[0]?.content, cells[1]?.content])
const basicOf = (markup: string) => groupsOf(markup)[0]?.markup

const MONO_DASH = '<span class="font-mono tabular-nums leading-[0]">—</span>'
const STORE_ROW = '開催・配布店舗'
const CHARACTER_ROW = '対象ビッカメ娘'

describe('回答に store / character の choice がある（v13・v2 の店舗）ときは、補い行を足さず通常の choice 行だけを出す', () => {
  const given = { stores: ['akiba'], characterIds: ['other'] }
  const questionsOf = (answers: Record<string, ClefAnswer>, props: RenderProps) =>
    pairsOf(basicOf(renderWith(answers, props))).map((pair) => pair[0])
  // 行のセルをタグ抜きの文字にする。
  const textsOf = (cells: { content: string }[] | undefined) =>
    cells?.map((cell) =>
      cell.content
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )

  test('v13: 開催・配布店舗と対象ビッカメ娘の行はちょうど 1 回ずつで、渡した店舗・ビッカメ娘に表が左右されない', () => {
    const markup = renderWith(v13Answers, given)
    expect(markup).toBe(renderWith(v13Answers))
    expect(pairsOf(basicOf(markup))).toEqual([
      ['ビッカメ娘のイベントか', 'はい'],
      ['配布物', 'アクキー'],
      [STORE_ROW, '船橋駅FACE店'],
      [CHARACTER_ROW, 'ふなとーたん']
    ])
    for (const text of ['未判定', 'AKIBA店</td>', 'その他</td>', 'ビックカメラ', 'scope="rowgroup"']) {
      expect(markup).not.toContain(text)
    }
    // store / character の行は venue. / character. の前方一致のグループに入らず、見出しも出ない。
    expect(groupsOf(markup).map((group) => group.label)).toEqual(['基本判定'])
  })

  test('v13: 店舗・ビッカメ娘の行は choice の行として、確率・しきい値・判定・次点を持つ（— ではない）', () => {
    const [store, character] = cellsOf(basicOf(renderWith(v13Answers, given))).slice(2)
    // 未保存の店舗・娘のしきい値は、最上位をそのまま採用するための 30%（共通値 90% ではない）。
    expect(textsOf(store)).toEqual([STORE_ROW, '船橋駅FACE店', '95.0%', '30.0%', '確定', 'AKIBA店 3.0% 店舗なし 1.0%'])
    expect(textsOf(character)).toEqual([
      CHARACTER_ROW,
      'ふなとーたん',
      '60.0%',
      '30.0%',
      '確定',
      'ふなたん 30.0% 複数 5.0%'
    ])
    // しきい値を取れない間は、ほかの choice の行と同じくしきい値と判定の列が — になる。
    const rows = cellsOf(basicOf(renderWith(v13Answers, { ...given, configured: false }))).slice(2)
    for (const cells of rows) expect([cells[3]?.content, cells[4]?.content]).toEqual([MONO_DASH, '—'])
  })

  test('v2 で store の回答があるとき: 店舗の補い行は出ず、無いビッカメ娘だけ末尾に補う（空なら未判定）', () => {
    const answers = { ...v2Answers, store: storeChoice }
    expect(pairsOf(basicOf(renderWith(answers, { stores: ['akiba'], characterIds: ['funabashi'] }))).slice(2)).toEqual([
      [STORE_ROW, '船橋駅FACE店'],
      [CHARACTER_ROW, 'ふなたん']
    ])
    expect(pairsOf(basicOf(renderWith(answers, { stores: [], characterIds: [] }))).slice(2)).toEqual([
      [STORE_ROW, '船橋駅FACE店'],
      [CHARACTER_ROW, '未判定']
    ])
  })

  test('v2 で store の回答が無い 8 問は従来どおり店舗の補い行を末尾に出し、store があれば行の順は describeAnswers のまま', () => {
    const base = ['ビッカメ娘のイベントか', '状態', '配布物', '単一イベントか']
    const rest = ['開始日', '終了日', '配布数', '配布条件']
    const props = { stores: ['akiba'], characterIds: ['funabashi'] }
    expect(questionsOf(v2Eight, props)).toEqual([...base, ...rest, STORE_ROW, CHARACTER_ROW])
    expect(pairsOf(basicOf(renderWith(v2Eight, props))).slice(-2)).toEqual([
      [STORE_ROW, 'AKIBA店'],
      [CHARACTER_ROW, 'ふなたん']
    ])
    expect(questionsOf({ ...v2Eight, store: storeChoice }, props)).toEqual([...base, STORE_ROW, ...rest, CHARACTER_ROW])
  })

  test('character の choice だけがあるときは、無い店舗の行だけを末尾に補う', () => {
    const pairs = pairsOf(basicOf(renderWith({ ...v2Answers, character: characterChoice }, given)))
    expect(pairs.slice(2)).toEqual([
      [CHARACTER_ROW, 'ふなとーたん'],
      [STORE_ROW, 'AKIBA店']
    ])
  })

  test('venue.* と character の choice（または character.* と store の choice）が混在しても二重にならない', () => {
    const venue = groupsOf(
      renderWith({ ...v2Answers, 'venue.funabashi': noulOf(0.98), character: characterChoice }, given)
    )
    expect(venue.map((group) => group.label)).toEqual(['基本判定', STORE_ROW])
    expect(pairsOf(venue[0]?.markup).slice(2)).toEqual([[CHARACTER_ROW, 'ふなとーたん']])
    const character = groupsOf(
      renderWith({ ...v2Answers, 'character.funato': noulOf(0.99), store: storeChoice }, given)
    )
    expect(character.map((group) => group.label)).toEqual(['基本判定', CHARACTER_ROW])
    expect(pairsOf(character[0]?.markup).slice(2)).toEqual([[STORE_ROW, '船橋駅FACE店']])
  })
})
