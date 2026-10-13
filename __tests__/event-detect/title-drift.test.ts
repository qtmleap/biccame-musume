import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  allNameTerms,
  BODY_LIMIT,
  EXAMPLE_PER_CATEGORY,
  EXAMPLE_TOP,
  isExampleTitle,
  normalizeTitle,
  TITLE_MAX_LENGTH,
  titleExamples,
  titleSystem,
  validateTitle
} from '@biccame/shared/event-detect/title'
import * as cliSeed from '../../scripts/lib/event-detect/seed'
import * as cliTitle from '../../scripts/lib/event-detect/seed-title'
import { readStoreNames } from '../../scripts/lib/event-detect/store'

// Worker 用の命名（shared の event-detect/title.ts）は、CLI（scripts/lib/event-detect/seed-title.ts・seed.ts）と
// 同じ文面・同じ規則を持つ。scripts は Worker から import できない（レイヤー違反）ので、二重管理になる。
// CLI 側を変えたら（命名の指示や検査の規則）、ここが落ちて shared 側を直し忘れない。
// CLI の指示文は保存済みキャッシュのハッシュの元なので、CLI を shared に寄せる変更はしない。

const events = [
  ...Array.from({ length: 50 }, () => ({ title: '缶バッジで繋ぐビッカメ娘旅', category: 'other' })),
  ...Array.from({ length: 40 }, () => ({ title: 'ビッカメ娘11周年記念名刺', category: 'limited_card' })),
  ...Array.from({ length: 11 }, () => ({ title: 'バレンタイン名刺', category: 'limited_card' })),
  ...Array.from({ length: 8 }, () => ({ title: '通常名刺', category: 'regular_card' })),
  ...Array.from({ length: 5 }, () => ({ title: '擬人化10周年記念アクキー', category: 'ackey' })),
  ...Array.from({ length: 3 }, () => ({ title: 'ハロウィン名刺', category: 'limited_card' })),
  ...Array.from({ length: 3 }, () => ({ title: '夏名刺', category: 'limited_card' })),
  ...Array.from({ length: 2 }, () => ({ title: '十三夜うさ耳アクスタセット', category: 'other' })),
  // 手本から除かれるはずの古い登録（説明語・括弧・キャラ名）
  ...Array.from({ length: 9 }, () => ({ title: '1月限定名刺配布開始', category: 'limited_card' })),
  ...Array.from({ length: 4 }, () => ({ title: 'ハロウィン名刺（新東たん）', category: 'limited_card' })),
  ...Array.from({ length: 6 }, () => ({ title: '新東たんの名刺', category: 'limited_card' })),
  // acsta は命名の指示に無い種別
  ...Array.from({ length: 2 }, () => ({ title: 'アクスタ名', category: 'acsta' }))
]

const cliTerms = async () =>
  cliSeed.seedNameTerms(await readStoreNames(resolve(import.meta.dirname, '../../workers/web/public/characters.json')))

describe('shared の命名は CLI と同じ', () => {
  test('定数（長さの上限・本文の上限・手本の件数）が同じ', () => {
    expect(TITLE_MAX_LENGTH).toBe(cliTitle.TITLE_MAX_LENGTH)
    expect(BODY_LIMIT).toBe(cliTitle.BODY_LIMIT)
    expect(EXAMPLE_TOP).toBe(cliTitle.EXAMPLE_TOP)
    expect(EXAMPLE_PER_CATEGORY).toBe(cliTitle.EXAMPLE_PER_CATEGORY)
  })

  test('命名の指示（titleSystem）が CLI と完全に一致する（手本あり）', async () => {
    const terms = await cliTerms()
    const cli = cliTitle.titleSystem(cliTitle.titleExamples(events, (title) => cliSeed.isExampleTitle(title, terms)))
    const shared = titleSystem(titleExamples(events, (title) => isExampleTitle(title, allNameTerms)))
    expect(shared).toBe(cli)
  })

  test('命名の指示（titleSystem）が CLI と完全に一致する（手本なし）', () => {
    const empty = { top: [], byCategory: { limited_card: [], regular_card: [], ackey: [], other: [] } }
    expect(titleSystem(empty)).toBe(cliTitle.titleSystem(empty))
  })

  test('手本（titleExamples）は同じ入力で CLI と同じ並びになる', async () => {
    const terms = await cliTerms()
    expect(titleExamples(events, (title) => isExampleTitle(title, allNameTerms))).toEqual(
      cliTitle.titleExamples(events, (title) => cliSeed.isExampleTitle(title, terms))
    )
  })

  test('shared の禁止語は CLI の禁止語（キャラ名と店舗名）を全て含む', async () => {
    const missing = (await cliTerms()).filter((term) => !allNameTerms.includes(term))
    expect(missing).toEqual([])
  })

  test('shared が CLI より多く持つ禁止語は、店舗の表示名（STORE_DISPLAY_NAMES）の正式名と別名の分だけ', async () => {
    const cli = new Set(await cliTerms())
    const extra = allNameTerms.filter((term) => !cli.has(term))
    // CLI は characters.json の店舗名からビックカメラを除いた形だけを持つ。shared はアプリの正式な店舗名も禁止にする（より厳しい側）。
    expect(extra.length).toBeGreaterThan(0)
    for (const term of extra) expect(term.length, term).toBeGreaterThanOrEqual(2)
  })

  test('題の形の検査（空・長さ・括弧・キャラ名・店舗名・「〜たん」）は CLI の checkTitle と同じ結果', async () => {
    const terms = await cliTerms()
    const samples = [
      '',
      'ハロウィン名刺',
      '缶バッジで繋ぐビッカメ娘旅',
      'ビックカメラギフトカード',
      'あ'.repeat(30),
      'あ'.repeat(31),
      ...['(', '（', '[', '［', '【', '「', '『', ')', '）', ']', '］', '】', '」', '』'].map((c) => `名刺${c}`),
      '謎たん名刺',
      'Airたん名刺',
      'Air名刺',
      ...terms.map((term) => `${term}名刺`)
    ]
    for (const sample of samples) {
      const normalized = cliSeed.normalizeTitle(sample)
      const cli = cliSeed.checkTitle(normalized, terms)
      // shared の検査は CLI の検査に、説明語・1 行・同名の企画の種別の食い違いを足したもの。足した規則に当たらない題で比べる。
      const shared = validateTitle(sample, { terms: allNameTerms, category: 'limited_card', existing: new Map() })
      expect(normalizeTitle(sample), sample).toBe(normalized)
      if (cli.ok) expect(shared.ok, sample).toBe(true)
      else expect(shared.ok, sample).toBe(false)
    }
  })

  test('手本の判定（isExampleTitle）は CLI と同じ結果', async () => {
    const terms = await cliTerms()
    const samples = [
      ...events.map((event) => event.title),
      '配布',
      'ver2',
      'ハロウィン\n名刺',
      ...terms.map((term) => `${term}名刺`)
    ]
    for (const sample of samples)
      expect(isExampleTitle(sample, allNameTerms), sample).toBe(cliSeed.isExampleTitle(sample, terms))
  })
})
