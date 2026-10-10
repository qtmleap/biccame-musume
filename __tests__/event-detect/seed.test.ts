import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { QUESTION_VERSION } from '../../scripts/lib/event-detect/decide'
import {
  APP_UNSUPPORTED_STORES,
  applySeed,
  assertColumns,
  assertInside,
  assertLocalDbPath,
  checkColumns,
  countRows,
  DEFAULT_TITLES,
  describeSeed,
  eventTitle,
  explainTitle,
  jstDayOf,
  jstDayToUtcIso,
  MIN_LIMITED_QUANTITY,
  openLocalDb,
  readLocalState,
  runSeed,
  type SeedEvent,
  type SeedPlan,
  type SeedRunOptions,
  seedNameTerms,
  selectSeedEvents,
  TITLE_REWRITES
} from '../../scripts/lib/event-detect/seed'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-seed-'))
  directories.push(path)
  return path
}

const NOW = '2026-10-09T03:00:00.000Z'

/**
 * 最後の言及の既定（NOW の 9〜10 日前）。終了の情報が無いイベントは、最後の言及が開始日より前だと「終了が分からないまま止まっている」と
 * 見なされて作られないので、フィクスチャは最近まで言及されている（fresh）ことにする。
 */
const RECENT = Date.parse('2026-09-30T00:00:00.000Z')

// ---------------------------------------------------------------------------------------------
// タイトル
// ---------------------------------------------------------------------------------------------

/** characters.json から作る readStoreNames と同じ形: 店舗キー → [キャラクター名, 店舗の短い名前?] */
const storeNames = new Map<string, string[]>([
  ['kashiwa', ['柏たん', '柏店']],
  ['air', ['Airたん']],
  ['biccamera', ['ビックカメラ']],
  ['kyoto', ['京都たん']],
  ['chiba', ['千葉たん', '千葉駅前店']],
  ['bicsim', ['ビックシムたん']]
])
const names = seedNameTerms(storeNames)

const title = (item: string, category: Parameters<typeof eventTitle>[1] = 'limited_card', start = '2026-07-07') =>
  eventTitle(item, category, start, names)

describe('seedNameTerms', () => {
  test('ビックカメラ（会社名）は取り除く語に入れない', () => {
    expect(names).toContain('柏たん')
    expect(names).toContain('千葉駅前店')
    expect(names).not.toContain('ビックカメラ')
  })
})

describe('eventTitle', () => {
  test('キャラ名を取り除く', () => {
    expect(title('柏たん擬人化7周年記念名刺')).toBe('擬人化7周年記念名刺')
    expect(title('京都たん缶バッジ', 'other')).toBe('缶バッジ')
  })

  test('キャラ名の前後の「の」「と」「&」を落とす', () => {
    expect(title('柏たんの通年名刺')).toBe('通年名刺')
    expect(title('柏たんと京都たんのコラボ名刺')).toBe('コラボ名刺')
    expect(title('柏たん&京都たんのコラボ名刺')).toBe('コラボ名刺')
    expect(title('大宮たんと仲良しフェア アクスタ', 'other')).toBe('仲良しフェア アクスタ')
    expect(title('コラボ名刺（柏たん）')).toBe('コラボ名刺')
  })

  test('「とっておき」のように「と」が語の一部のときは落とさない', () => {
    expect(title('柏たんとっておき名刺')).toBe('とっておき名刺')
  })

  test('店舗名・ビックカメラ＋店舗名も取り除く', () => {
    expect(title('千葉駅前店開店10周年記念限定名刺')).toBe('開店10周年記念限定名刺')
    expect(title('ビックカメラ千葉駅前店誕生23周年記念名刺')).toBe('誕生23周年記念名刺')
  })

  test('Air は英字の部分だけでも取り除く（別の英単語の一部は残す）', () => {
    expect(title('Airたんとのおそろいデザイン限定名刺')).toBe('おそろいデザイン限定名刺')
    expect(title('Airおそろい名刺')).toBe('おそろい名刺')
    expect(title('Airplane名刺')).toBe('Airplane名刺')
  })

  test('「ビッカメ娘」は残す', () => {
    expect(title('ビッカメ娘11周年記念名刺')).toBe('ビッカメ娘11周年記念名刺')
    expect(title('柏たんのビッカメ娘旅 缶バッジ', 'other')).toBe('ビッカメ娘旅 缶バッジ')
  })

  test('ビックカメラ（会社名）は残す', () => {
    expect(title('ビックカメラギフトカード', 'other')).toBe('ビックカメラギフトカード')
  })

  test('NFKC で全角の数字・記号を揃える', () => {
    expect(title('擬人化５周年イベント アクスタ＋アクキーセット', 'other')).toBe(
      '擬人化5周年イベント アクスタ+アクキーセット'
    )
  })

  test('季節＋限定名刺は D1 の多数派の季節＋名刺に寄せる', () => {
    expect(title('バレンタイン限定名刺')).toBe('バレンタイン名刺')
    expect(title('夏限定名刺')).toBe('夏名刺')
    expect(title('ハロウィン限定名刺')).toBe('ハロウィン名刺')
    expect(title('新年限定名刺')).toBe('新年名刺')
    expect(title('夏限定名刺（マーメイド名刺）')).toBe('夏名刺(マーメイド名刺)')
  })

  test('D1 に多数派が無い形は寄せない（限定名刺・クリスマス限定名刺）', () => {
    expect(title('限定名刺')).toBe('限定名刺')
    expect(title('限定の名刺')).toBe('限定の名刺')
    expect(title('クリスマス限定名刺')).toBe('クリスマス限定名刺')
  })

  test('「新しい名刺」「新名刺」は名刺にする', () => {
    expect(title('新名刺', 'other')).toBe('名刺')
    expect(title('新しい名刺', 'other')).toBe('名刺')
    expect(title('京都たん擬人化10th 記念 新名刺')).toBe('擬人化10th 記念 名刺')
  })

  test('regular_card の通常の名刺は「通常名刺」', () => {
    expect(title('通年名刺', 'regular_card')).toBe('通常名刺')
    expect(title('名刺', 'regular_card')).toBe('通常名刺')
    expect(title('柏たんの通年名刺', 'regular_card')).toBe('通常名刺')
    expect(title('通年名刺新デザイン', 'regular_card')).toBe('通常名刺')
    expect(title('通常名刺（京都たん）', 'regular_card')).toBe('通常名刺')
    expect(title('新しい通常名刺', 'regular_card')).toBe('通常名刺')
    expect(title('新しい名刺', 'regular_card')).toBe('通常名刺')
    expect(title('通年名刺 新デザイン', 'regular_card')).toBe('通常名刺')
  })

  test('regular_card でも記念名・季節が付く名刺は名前を残す', () => {
    expect(title('ビッカメ娘11周年記念名刺', 'regular_card')).toBe('ビッカメ娘11周年記念名刺')
    expect(title('夏名刺', 'regular_card')).toBe('夏名刺')
  })

  test('limited_card の「名刺」だけの item は開始月から季節を補う', () => {
    expect(title('名刺', 'limited_card', '2026-12-01')).toBe('冬名刺')
    expect(title('名刺', 'limited_card', '2026-01-15')).toBe('冬名刺')
    expect(title('名刺', 'limited_card', '2026-02-28')).toBe('冬名刺')
    expect(title('名刺', 'limited_card', '2026-03-01')).toBe('春名刺')
    expect(title('名刺', 'limited_card', '2026-05-31')).toBe('春名刺')
    expect(title('名刺', 'limited_card', '2026-06-01')).toBe('夏名刺')
    expect(title('名刺', 'limited_card', '2026-08-31')).toBe('夏名刺')
    expect(title('名刺', 'limited_card', '2026-09-01')).toBe('秋名刺')
    expect(title('柏たん名刺', 'limited_card', '2026-11-30')).toBe('秋名刺')
    expect(title('新しい名刺', 'limited_card', '2026-07-01')).toBe('夏名刺')
  })

  test('季節は limited_card の「名刺」だけに補う（他の item・category には補わない）', () => {
    expect(title('名刺', 'other', '2026-07-01')).toBe('名刺')
    expect(title('アクキー', 'ackey', '2026-07-01')).toBe('アクキー')
    expect(title('コラボ名刺', 'limited_card', '2026-07-01')).toBe('コラボ名刺')
    expect(title('ハロウィン名刺', 'limited_card', '2026-07-01')).toBe('ハロウィン名刺')
  })

  test('ハロウィン・クリスマス・バレンタイン・お正月の語が item にあれば季節を補わない', () => {
    // 「ハロウィンハチたん」は一般則（カタカナ＋たん）で取り除かれ、名刺だけが残る
    expect(explainTitle('ハロウィンハチたん名刺', 'limited_card', '2026-07-01', names)).toEqual({
      title: '名刺',
      generic: ['ハロウィンハチたん']
    })
  })

  test('取り除いて空になる item はカテゴリ別の既定名にする', () => {
    expect(title('柏たん', 'limited_card')).toBe(DEFAULT_TITLES.limited_card)
    expect(title('柏たんの', 'regular_card')).toBe(DEFAULT_TITLES.regular_card)
    expect(title('京都たん・柏たん', 'ackey')).toBe(DEFAULT_TITLES.ackey)
    expect(title('柏店', 'other')).toBe(DEFAULT_TITLES.other)
    expect(title('柏たん', 'acsta')).toBe(DEFAULT_TITLES.acsta)
    expect(DEFAULT_TITLES).toEqual({
      limited_card: '限定名刺',
      regular_card: '通常名刺',
      ackey: 'アクキー',
      acsta: 'アクリルスタンド',
      other: 'グッズ'
    })
  })

  test('表記の揺れの辞書は D1 の件数で多数派に寄せている（書いた件数が逆転していない）', () => {
    for (const rule of TITLE_REWRITES.filter((entry) => entry.source === 'd1'))
      expect(rule.d1To).toBeGreaterThan(rule.d1From)
  })

  test('キャラ名ではない「〜たん」は、語の頭から始まる 1 種類の文字だけを取り除く', () => {
    expect(explainTitle('通常名刺（ダンサーハチたん）', 'other', '2026-07-07', names)).toEqual({
      title: '通常名刺',
      generic: ['ダンサーハチたん']
    })
    expect(explainTitle('新通年名刺（新西たん10周年記念名刺リニューアル）', 'other', '2026-07-07', names)).toEqual({
      title: '新通年名刺(10周年記念名刺リニューアル)',
      generic: ['新西たん']
    })
    expect(explainTitle('WIXOSS×ビッカメ娘 ビックロたん', 'other', '2026-07-07', names).title).toBe('WIXOSS×ビッカメ娘')
  })

  test('漢字の直前に語がある「〜たん」は、前の語を巻き込まないよう取り除かない', () => {
    // 「記念名刺新西たん」の語の頭が分からないので、そのまま残す（「記念名刺」を失わない）
    expect(explainTitle('擬人化記念名刺新西たん', 'other', '2026-07-07', names)).toEqual({
      title: '擬人化記念名刺新西たん',
      generic: []
    })
    expect(explainTitle('擬人化記念名刺 新西たん', 'other', '2026-07-07', names)).toEqual({
      title: '擬人化記念名刺',
      generic: ['新西たん']
    })
    expect(explainTitle('記念名刺の新西たんバージョン', 'other', '2026-07-07', names).title).toBe(
      '記念名刺のバージョン'
    )
  })

  test('タイトルが 40 文字を超えても切らない', () => {
    const long = '擬人化記念アクリルキーホルダー特別仕様ドレス衣装バージョン第2弾プレゼントキャンペーン実施中のお知らせ'
    expect(title(long, 'ackey')).toBe(long)
  })
})

// ---------------------------------------------------------------------------------------------
// 日付
// ---------------------------------------------------------------------------------------------

describe('jstDayToUtcIso', () => {
  test('JST 0 時は前日の UTC 15:00', () => {
    expect(jstDayToUtcIso('2026-10-04')).toBe('2026-10-03T15:00:00.000Z')
  })

  test('月初・年初・うるう日の境界', () => {
    expect(jstDayToUtcIso('2026-01-01')).toBe('2025-12-31T15:00:00.000Z')
    expect(jstDayToUtcIso('2026-03-01')).toBe('2026-02-28T15:00:00.000Z')
    expect(jstDayToUtcIso('2024-03-01')).toBe('2024-02-29T15:00:00.000Z')
    expect(jstDayToUtcIso('2024-02-29')).toBe('2024-02-28T15:00:00.000Z')
    expect(jstDayToUtcIso('2026-12-31')).toBe('2026-12-30T15:00:00.000Z')
    expect(jstDayToUtcIso('2000-02-29')).toBe('2000-02-28T15:00:00.000Z')
  })

  test('存在しない日付・形式違いは undefined', () => {
    expect(jstDayToUtcIso('2026-02-29')).toBeUndefined()
    expect(jstDayToUtcIso('2026-02-30')).toBeUndefined()
    expect(jstDayToUtcIso('2026-13-01')).toBeUndefined()
    expect(jstDayToUtcIso('2026-00-10')).toBeUndefined()
    expect(jstDayToUtcIso('2026-1-1')).toBeUndefined()
    expect(jstDayToUtcIso('2026-10-04T00:00:00Z')).toBeUndefined()
    expect(jstDayToUtcIso('')).toBeUndefined()
  })

  test('書き込む形式は常に ...T15:00:00.000Z', () => {
    for (const day of ['2023-01-01', '2024-02-29', '2025-07-31', '2026-10-04', '2027-12-31'])
      expect(jstDayToUtcIso(day)).toMatch(/^\d{4}-\d{2}-\d{2}T15:00:00\.000Z$/)
  })
})

describe('jstDayOf', () => {
  test('UTC 15:00 以降は翌日の JST の暦日（Z 付きも +00:00 も）', () => {
    expect(jstDayOf('2025-12-31T15:00:00.000Z')).toBe('2026-01-01')
    expect(jstDayOf('2025-12-31T15:00:00.000+00:00')).toBe('2026-01-01')
    expect(jstDayOf('2026-01-01T14:59:59.999Z')).toBe('2026-01-01')
    expect(jstDayOf('2026-02-28T15:00:00.000Z')).toBe('2026-03-01')
    expect(jstDayOf('2024-02-28T15:00:00.000Z')).toBe('2024-02-29')
  })

  test('jstDayToUtcIso と往復して元の暦日に戻る', () => {
    for (const day of ['2024-02-29', '2026-01-01', '2026-03-01', '2026-12-31']) {
      const iso = jstDayToUtcIso(day)
      expect(iso === undefined ? undefined : jstDayOf(iso)).toBe(day)
    }
  })

  test('読めない日時は undefined', () => {
    expect(jstDayOf('not a date')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------
// 絞り込み
// ---------------------------------------------------------------------------------------------

type EventInit = Partial<SeedEvent> & { id: string }

const seedEvent = (init: EventInit): SeedEvent => ({
  store: 'kashiwa',
  item: '夏名刺',
  category: 'limited_card',
  startDate: '2026-07-01',
  firstSeen: 1,
  lastSeen: RECENT,
  posts: [{ postId: `${init.id}-1`, status: 'announce' }],
  ...init
})

const lookup = (entries: Record<string, string>) => async (ids: ReadonlySet<string>) =>
  new Map(Object.entries(entries).filter(([id]) => ids.has(id)))

/** 投稿 ID が <id>-1, <id>-2 … の LLM イベント向けに、全投稿のアカウント名を kashiwa_bic にする */
const everyone = async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'bic_kashiwa'] as const))

/** 全投稿の種類を original にする（リプライを区別しないテスト向け） */
const allOriginal = async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'original' as const]))

const baseOptions = (events: readonly SeedEvent[], clef: Record<string, number>) => ({
  events,
  clef: new Map(Object.entries(clef)),
  threshold: 0.7,
  gold: [],
  storeKeys: new Set(['kashiwa', 'kyoto', 'chiba']),
  names,
  lookupScreenNames: everyone,
  lookupKinds: allOriginal,
  now: NOW
})

const stageOf = (selection: Awaited<ReturnType<typeof selectSeedEvents>>, label: string) => {
  const stage = selection.stages.find((entry) => entry.label.includes(label))
  if (!stage) throw new Error(`no stage: ${label}`)
  return stage
}

describe('selectSeedEvents', () => {
  test('Clef の判定が無いイベントは対象外（代表投稿 = 最初の言及の判定を見る）', async () => {
    const events = [
      seedEvent({ id: 'judged' }),
      seedEvent({ id: 'unjudged' }),
      // 2 番目の言及だけ判定があっても、代表投稿（最初）に判定が無ければ対象外
      seedEvent({
        id: 'second-only',
        startDate: '2026-07-02',
        posts: [
          { postId: 'x-1', status: 'announce' },
          { postId: 'x-2', status: 'start' }
        ]
      })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'judged-1': 0.9, 'x-2': 0.99 }))
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['judged'])
    expect(stageOf(selection, 'Clef の判定がある')).toEqual({
      label: expect.any(String),
      excluded: 2,
      remaining: 1
    })
  })

  test('確率がしきい値以上だけ通す（しきい値ちょうどは通る）', async () => {
    const events = [
      seedEvent({ id: 'a', startDate: '2026-07-01' }),
      seedEvent({ id: 'b', startDate: '2026-07-02' }),
      seedEvent({ id: 'c', startDate: '2026-07-03' })
    ]
    const clef = { 'a-1': 0.69, 'b-1': 0.7, 'c-1': 0.99 }
    const selection = await selectSeedEvents(baseOptions(events, clef))
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual(['b', 'c'])
    expect(stageOf(selection, '確率が 0.7 以上').excluded).toBe(1)
    const strict = await selectSeedEvents({ ...baseOptions(events, clef), threshold: 0.9 })
    expect(strict.plans.map((plan) => plan.emulatedId)).toEqual(['c'])
  })

  test('開始日が無い・暦日として読めないイベントは対象外', async () => {
    const events = [
      seedEvent({ id: 'ok' }),
      seedEvent({ id: 'none', startDate: undefined }),
      seedEvent({ id: 'bad', startDate: '2026-02-30' })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'ok-1': 1, 'none-1': 1, 'bad-1': 1 }))
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['ok'])
    expect(stageOf(selection, '開始日がある').excluded).toBe(2)
  })

  test('期間は since 以上・before 未満（開始日の JST の暦日）', async () => {
    const events = [
      seedEvent({ id: 'old', startDate: '2022-12-31' }),
      seedEvent({ id: 'from', startDate: '2023-01-01' }),
      seedEvent({ id: 'mid', startDate: '2025-06-01' }),
      seedEvent({ id: 'until', startDate: '2026-01-01' })
    ]
    const clef = { 'old-1': 1, 'from-1': 1, 'mid-1': 1, 'until-1': 1 }
    const all = await selectSeedEvents(baseOptions(events, clef))
    expect(all.plans).toHaveLength(4)
    const ranged = await selectSeedEvents({ ...baseOptions(events, clef), since: '2023-01-01', before: '2026-01-01' })
    expect(ranged.plans.map((plan) => plan.emulatedId).sort()).toEqual(['from', 'mid'])
    expect(stageOf(ranged, '期間').excluded).toBe(2)
  })

  test('D1 の参考 URL と同じ投稿を（どの言及でも）言及しているイベントは対象外', async () => {
    const events = [
      seedEvent({ id: 'known' }),
      seedEvent({
        id: 'later-mention',
        startDate: '2026-07-02',
        posts: [
          { postId: 'later-1', status: 'announce' },
          { postId: '2222', status: 'start' }
        ]
      }),
      seedEvent({ id: 'fresh', startDate: '2026-07-03' })
    ]
    const gold = [
      {
        stores: ['kyoto'],
        startDate: '2026-01-01T15:00:00.000Z',
        referenceUrls: [
          { url: 'https://x.com/bic_kashiwa/status/known-1' },
          { url: 'https://x.com/bic_kashiwa/status/2222' },
          { url: 'https://x.com/bic_kashiwa/status/1111' }
        ]
      }
    ]
    const clef = { 'known-1': 1, 'later-1': 1, 'fresh-1': 1 }
    // 数字でない ID（known-1）は X の投稿 URL として読めないので、読めた 2222 だけが効く
    const selection = await selectSeedEvents({ ...baseOptions(events, clef), gold })
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual(['fresh', 'known'])
    expect(stageOf(selection, 'D1 の参考 URL').excluded).toBe(1)
  })

  test('D1 の参考 URL の投稿 ID は /status/<数字> から読む', async () => {
    const events = [seedEvent({ id: 'dup', posts: [{ postId: '555', status: 'announce' }] })]
    const gold = [
      {
        stores: ['kyoto'],
        startDate: '2020-01-01T15:00:00.000Z',
        referenceUrls: [{ url: 'https://x.com/a/status/555' }]
      }
    ]
    const selection = await selectSeedEvents({ ...baseOptions(events, { '555': 1 }), gold })
    expect(selection.plans).toEqual([])
  })

  test('D1 に同じ店舗・同じ開始日（JST）のイベントがあれば対象外。店舗か日が違えば残す', async () => {
    const events = [
      seedEvent({ id: 'same', startDate: '2026-10-04' }),
      seedEvent({ id: 'other-store', store: 'kyoto', startDate: '2026-10-04' }),
      seedEvent({ id: 'other-day', startDate: '2026-10-05' })
    ]
    const clef = { 'same-1': 1, 'other-store-1': 1, 'other-day-1': 1 }
    // D1 の 2026-10-03T15:00:00.000Z は JST の 2026-10-04 0 時
    const gold = [{ stores: ['kashiwa', 'chiba'], startDate: '2026-10-03T15:00:00.000Z', referenceUrls: [] }]
    const selection = await selectSeedEvents({ ...baseOptions(events, clef), gold })
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual(['other-day', 'other-store'])
    expect(stageOf(selection, '同じ店舗・同じ開始日のイベントが無い').excluded).toBeGreaterThanOrEqual(0)
    const byDay = selection.stages.filter((stage) => stage.label.startsWith('D1 に同じ店舗'))
    expect(byDay.map((stage) => stage.excluded)).toEqual([1])
  })

  test('ローカル D1 の既存行と同じ店舗・同じ開始日のイベントは対象外。--force（local なし）なら照合しない', async () => {
    const events = [
      seedEvent({ id: 'dup', startDate: '2026-10-04' }),
      seedEvent({ id: 'new', startDate: '2026-10-05' })
    ]
    const clef = { 'dup-1': 1, 'new-1': 1 }
    const local = { storeDays: new Set(['kashiwa|2026-10-04']), invalid: 0 }
    const checked = await selectSeedEvents({ ...baseOptions(events, clef), local })
    expect(checked.plans.map((plan) => plan.emulatedId)).toEqual(['new'])
    const forced = await selectSeedEvents(baseOptions(events, clef))
    expect(forced.plans.map((plan) => plan.emulatedId).sort()).toEqual(['dup', 'new'])
  })

  test('参考 URL は種別ごとに最初の言及。ongoing は使わず、無い種別は作らない', async () => {
    const events = [
      seedEvent({
        id: 'e',
        posts: [
          { postId: '101', status: 'announce' },
          { postId: '102', status: 'ongoing' },
          { postId: '103', status: 'start' },
          { postId: '104', status: 'announce' },
          { postId: '105', status: 'start' },
          { postId: '106', status: 'end' },
          { postId: '107', status: 'end' }
        ]
      }),
      seedEvent({
        id: 'only-ongoing',
        startDate: '2026-07-02',
        posts: [
          { postId: '201', status: 'ongoing' },
          { postId: '202', status: 'ongoing' }
        ]
      }),
      seedEvent({ id: 'only-start', startDate: '2026-07-03', posts: [{ postId: '301', status: 'start' }] })
    ]
    const clef = { '101': 1, '201': 1, '301': 1 }
    const selection = await selectSeedEvents(baseOptions(events, clef))
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan]))
    expect(byId.get('e')?.references).toEqual([
      { type: 'announce', url: 'https://x.com/bic_kashiwa/status/101', kind: 'original' },
      { type: 'start', url: 'https://x.com/bic_kashiwa/status/103', kind: 'original' },
      { type: 'end', url: 'https://x.com/bic_kashiwa/status/106', kind: 'original' }
    ])
    expect(byId.get('only-start')?.references).toEqual([
      { type: 'start', url: 'https://x.com/bic_kashiwa/status/301', kind: 'original' }
    ])
    // ongoing の言及しか無いイベントは参考 URL が作れないので作らない
    expect(byId.has('only-ongoing')).toBe(false)
    expect(stageOf(selection, '参考 URL を 1 件以上作れる').excluded).toBe(1)
  })

  test('posts.jsonl に無い投稿の種別は作らない。1 件も作れなければ対象外', async () => {
    const events = [
      seedEvent({
        id: 'partial',
        posts: [
          { postId: '11', status: 'announce' },
          { postId: '12', status: 'end' }
        ]
      }),
      seedEvent({ id: 'none', startDate: '2026-07-02', posts: [{ postId: '21', status: 'announce' }] })
    ]
    const selection = await selectSeedEvents({
      ...baseOptions(events, { '11': 1, '21': 1 }),
      lookupScreenNames: lookup({ '12': 'Bic_Kashiwa' })
    })
    expect(selection.plans).toHaveLength(1)
    expect(selection.plans[0].references).toEqual([
      { type: 'end', url: 'https://x.com/Bic_Kashiwa/status/12', kind: 'original' }
    ])
    expect(selection.missingPosts).toBe(2)
  })

  test('店舗キーが characters.json に無いイベントは対象外', async () => {
    const events = [seedEvent({ id: 'ok' }), seedEvent({ id: 'ghost', store: 'atlantis', startDate: '2026-07-02' })]
    const selection = await selectSeedEvents(baseOptions(events, { 'ok-1': 1, 'ghost-1': 1 }))
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['ok'])
    expect(stageOf(selection, '店舗キー').excluded).toBe(1)
  })

  test('アプリの StoreKeySchema に無い店舗（air）のイベントは作らない', async () => {
    const events = [seedEvent({ id: 'ok' }), seedEvent({ id: 'air', store: 'air', startDate: '2026-07-02' })]
    const options = { ...baseOptions(events, { 'ok-1': 1, 'air-1': 1 }), storeKeys: new Set(['kashiwa', 'air']) }
    const unguarded = await selectSeedEvents(options)
    expect(unguarded.plans.map((plan) => plan.emulatedId).sort()).toEqual(['air', 'ok'])
    const guarded = await selectSeedEvents({ ...options, unsupportedStores: new Set(APP_UNSUPPORTED_STORES) })
    expect(guarded.plans.map((plan) => plan.emulatedId)).toEqual(['ok'])
    expect(stageOf(guarded, 'StoreKeySchema').excluded).toBe(1)
  })

  test('APP_UNSUPPORTED_STORES は characters.json とアプリの StoreKeySchema の差と一致している', async () => {
    const root = resolve(import.meta.dir, '../..')
    const schema = await readFile(join(root, 'workers/app/src/schemas/store.dto.ts'), 'utf8')
    const start = schema.indexOf('export const StoreKeySchema')
    const body = schema.slice(start, schema.indexOf(']', start))
    const enumKeys = new Set([...body.matchAll(/'([a-z0-9]+)'/g)].map((match) => match[1]))
    const characters = JSON.parse(await readFile(join(root, 'workers/app/public/characters.json'), 'utf8'))
    const ids: string[] = characters.map((character: { id: string }) => character.id)
    expect(enumKeys.size).toBeGreaterThan(40)
    expect(ids.filter((id) => !enumKeys.has(id)).sort()).toEqual([...APP_UNSUPPORTED_STORES].sort())
  })

  test('各段階の除外と残りが続けてつながる', async () => {
    const events = [
      seedEvent({ id: 'a' }),
      seedEvent({ id: 'b', startDate: undefined }),
      seedEvent({ id: 'c', store: 'atlantis', startDate: '2026-07-02' })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'a-1': 1, 'b-1': 1, 'c-1': 1 }))
    expect(selection.stages[0].remaining).toBe(3)
    selection.stages.slice(1).forEach((stage, index) => {
      expect(stage.remaining + stage.excluded).toBe(selection.stages[index].remaining)
    })
    expect(selection.stages.at(-1)?.remaining).toBe(selection.plans.length)
  })

  test('同じ店舗・開始日・題の LLM イベントは言及の最も多い 1 件だけ作る', async () => {
    const mentions = (id: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({ postId: `${id}-${index + 1}`, status: 'announce' as const }))
    const events = [
      seedEvent({ id: 'few', item: '夏限定名刺', posts: mentions('few', 2) }),
      seedEvent({ id: 'most', item: '夏名刺', posts: mentions('most', 5) }),
      seedEvent({ id: 'mid', item: '柏たん夏名刺', posts: mentions('mid', 3) }),
      // 題が違う / 店舗が違う / 日が違うものは別のイベント
      seedEvent({ id: 'other-title', item: '夏のコラボ名刺', posts: mentions('other-title', 1) }),
      seedEvent({ id: 'other-store', store: 'kyoto', posts: mentions('other-store', 1) }),
      seedEvent({ id: 'other-day', startDate: '2026-07-02', posts: mentions('other-day', 1) })
    ]
    const clef = Object.fromEntries(events.map((event) => [event.posts[0].postId, 0.9]))
    const selection = await selectSeedEvents(baseOptions(events, clef))
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual([
      'most',
      'other-day',
      'other-store',
      'other-title'
    ])
    expect(selection.duplicates.dropped).toBe(2)
    expect(selection.duplicates.examples).toEqual([
      { store: 'kashiwa', startDay: '2026-07-01', title: '夏名刺', kept: 'most' }
    ])
  })

  test('言及数が同じなら先に作られた方（firstSeen が小さい方）を残す', async () => {
    const events = [
      seedEvent({ id: 'later', firstSeen: 200 }),
      seedEvent({ id: 'earlier', firstSeen: 100 }),
      seedEvent({ id: 'latest', firstSeen: 300 })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'later-1': 1, 'earlier-1': 1, 'latest-1': 1 }))
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['earlier'])
  })

  test('--limit は開始日の新しい順に先頭 N 件', async () => {
    const events = [
      seedEvent({ id: 'a', startDate: '2026-05-01' }),
      seedEvent({ id: 'b', startDate: '2026-09-01' }),
      seedEvent({ id: 'c', startDate: '2026-07-01' })
    ]
    const clef = { 'a-1': 1, 'b-1': 1, 'c-1': 1 }
    const selection = await selectSeedEvents({ ...baseOptions(events, clef), limit: 2 })
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['b', 'c'])
  })

  test('日付・配布数・開始前フラグ', async () => {
    const events = [
      seedEvent({
        id: 'full',
        startDate: '2026-10-04',
        endDate: '2026-10-31',
        endedAt: '2026-10-20',
        quantity: 100
      }),
      seedEvent({ id: 'future', startDate: '2026-10-10' }),
      seedEvent({ id: 'today', startDate: '2026-10-09' }),
      seedEvent({ id: 'bare', startDate: '2024-03-01' })
    ]
    const clef = { 'full-1': 1, 'future-1': 1, 'today-1': 1, 'bare-1': 1 }
    const selection = await selectSeedEvents(baseOptions(events, clef))
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan]))
    expect(byId.get('full')).toMatchObject({
      startDate: '2026-10-03T15:00:00.000Z',
      endDate: '2026-10-30T15:00:00.000Z',
      endedAt: '2026-10-19T15:00:00.000Z',
      limitedQuantity: 100,
      isPreliminary: false,
      mentions: 1,
      clef: 1
    })
    expect(byId.get('bare')).toMatchObject({
      startDate: '2024-02-29T15:00:00.000Z',
      endDate: null,
      endedAt: null,
      limitedQuantity: null
    })
    // NOW は JST の 2026-10-09。今日より後の開始日だけ is_preliminary
    expect(byId.get('future')?.isPreliminary).toBe(true)
    expect(byId.get('today')?.isPreliminary).toBe(false)
  })

  test('endDate が startDate より前なら null にして数える。暦日として読めない日付も null', async () => {
    const events = [
      seedEvent({ id: 'reversed', startDate: '2026-07-10', endDate: '2026-07-01' }),
      seedEvent({ id: 'same-day', startDate: '2026-07-11', endDate: '2026-07-11' }),
      seedEvent({ id: 'broken', startDate: '2026-07-12', endDate: '2026-02-30', endedAt: '2026-13-01' })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'reversed-1': 1, 'same-day-1': 1, 'broken-1': 1 }))
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan]))
    expect(byId.get('reversed')?.endDate).toBeNull()
    expect(byId.get('same-day')?.endDate).toBe('2026-07-10T15:00:00.000Z')
    expect(byId.get('broken')).toMatchObject({ endDate: null, endedAt: null })
    expect(selection.endBeforeStart).toEqual({
      count: 1,
      examples: [{ emulatedId: 'reversed', startDay: '2026-07-10', endDay: '2026-07-01' }]
    })
    expect(selection.invalidDays).toBe(2)
  })

  test('40 文字を超えるタイトルはレポート用に集める（切らない）', async () => {
    const long = '擬人化記念アクリルキーホルダー特別仕様ドレス衣装バージョン第2弾プレゼントキャンペーン実施中のお知らせ'
    const events = [
      seedEvent({ id: 'long', item: long, category: 'ackey' }),
      seedEvent({ id: 'short', startDate: '2026-07-02' })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'long-1': 1, 'short-1': 1 }))
    expect(selection.longTitles).toEqual([{ title: long, item: long }])
    expect(selection.plans.find((plan) => plan.emulatedId === 'long')?.title).toBe(long)
  })

  test('タイトルはキャラ名を除いた形になる', async () => {
    const events = [seedEvent({ id: 'a', item: '柏たん擬人化7周年記念名刺' })]
    const selection = await selectSeedEvents(baseOptions(events, { 'a-1': 1 }))
    expect(selection.plans[0].title).toBe('擬人化7周年記念名刺')
    expect(selection.plans[0].item).toBe('柏たん擬人化7周年記念名刺')
  })
})

// ---------------------------------------------------------------------------------------------
// ローカル D1（一時 SQLite）
// ---------------------------------------------------------------------------------------------

const MIGRATIONS = resolve(import.meta.dir, '../../prisma/migrations')

/** 本番と同じ DDL（prisma/migrations の SQL を順に流す）で、.wrangler/state 配下に一時 D1 を作る */
const makeLocalDb = async (root: string, name = 'local.sqlite') => {
  const path = join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', name)
  await mkdir(dirname(path), { recursive: true })
  const db = new Database(path, { create: true })
  db.exec('PRAGMA journal_mode = WAL')
  const migrations = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const migration of migrations) db.exec(readFileSync(join(MIGRATIONS, migration, 'migration.sql'), 'utf8'))
  return { db, path }
}

const EXISTING_AT = '2026-01-13T07:11:25.449Z'

/** 人が検証した既存イベント（本番と同じ +00:00 形式の日付を含む）を入れる */
const insertExisting = (db: Database) => {
  db.run(
    `INSERT INTO events (id, category, title, limited_quantity, start_date, end_date, ended_at, is_verified, is_preliminary, created_at, updated_at)
     VALUES ('existing-1', 'limited_card', 'バレンタイン名刺', 100, '2026-10-03T15:00:00.000+00:00', NULL, NULL, 1, 0, ?, ?)`,
    [EXISTING_AT, EXISTING_AT]
  )
  db.run(
    `INSERT INTO event_stores (id, event_id, store_key, created_at, updated_at) VALUES ('s-1', 'existing-1', 'kashiwa', ?, ?)`,
    [EXISTING_AT, EXISTING_AT]
  )
  db.run(
    `INSERT INTO event_reference_urls (id, event_id, type, url, created_at, updated_at) VALUES ('u-1', 'existing-1', 'announce', 'https://x.com/bic_kashiwa/status/9', ?, ?)`,
    [EXISTING_AT, EXISTING_AT]
  )
  db.run(
    `INSERT INTO event_conditions (id, event_id, type, purchase_amount, quantity, created_at, updated_at) VALUES ('c-1', 'existing-1', 'first_come', NULL, 100, ?, ?)`,
    [EXISTING_AT, EXISTING_AT]
  )
}

const dump = (db: Database) => ({
  events: db.query('SELECT * FROM events ORDER BY id').all(),
  event_stores: db.query('SELECT * FROM event_stores ORDER BY id').all(),
  event_reference_urls: db.query('SELECT * FROM event_reference_urls ORDER BY id').all(),
  event_conditions: db.query('SELECT * FROM event_conditions ORDER BY id').all()
})

const plan = (init: Partial<SeedPlan> & { emulatedId: string }): SeedPlan => ({
  store: 'kashiwa',
  item: '夏名刺',
  title: '夏名刺',
  ruleTitle: '夏名刺',
  llmTitle: null,
  titleSource: 'rule',
  titleReject: null,
  category: 'limited_card',
  startDay: '2026-07-01',
  endDay: null,
  endedDay: null,
  startDate: '2026-06-30T15:00:00.000Z',
  endDate: null,
  endedAt: null,
  endedAtEstimated: false,
  limitedQuantity: null,
  isPreliminary: false,
  references: [{ type: 'announce', url: 'https://x.com/bic_kashiwa/status/1', kind: 'original' }],
  clef: 0.9,
  mentions: 1,
  ...init
})

describe('assertLocalDbPath / openLocalDb', () => {
  test('.wrangler/state 配下の .sqlite だけ許す', async () => {
    const root = await tempDir()
    const { path } = await makeLocalDb(root)
    expect(assertLocalDbPath(path)).toBe(path)
  })

  test('.wrangler/state を含まないパスは拒否する（本番の誤指定を防ぐ）', async () => {
    const root = await tempDir()
    expect(() => assertLocalDbPath(join(root, 'prod.sqlite'))).toThrow('.wrangler/state')
    expect(() => assertLocalDbPath(join(root, '.wrangler', 'other', 'local.sqlite'))).toThrow('.wrangler/state')
    expect(() => assertLocalDbPath(join(root, 'wrangler', 'state', 'local.sqlite'))).toThrow('.wrangler/state')
    expect(() => assertLocalDbPath(join(root, '.wrangler', 'statefoo', 'local.sqlite'))).toThrow('.wrangler/state')
    expect(() => assertLocalDbPath(join(root, '.wrangler', 'state', 'local.db'))).toThrow('.wrangler/state')
    expect(() => assertLocalDbPath('/tmp/other.sqlite')).toThrow('.wrangler/state')
  })

  test('ファイルが無ければ作らずに止まる', async () => {
    const root = await tempDir()
    const path = join(root, '.wrangler', 'state', 'v3', 'd1', 'missing.sqlite')
    expect(() => openLocalDb(path, true)).toThrow('not found')
    expect(() => openLocalDb(path, false)).toThrow('not found')
    expect(existsSync(path)).toBe(false)
  })

  test('.wrangler/state の外を指すシンボリックリンクは拒否する', async () => {
    const root = await tempDir()
    const outside = join(root, 'outside.sqlite')
    new Database(outside, { create: true }).close()
    const link = join(root, '.wrangler', 'state', 'link.sqlite')
    await mkdir(dirname(link), { recursive: true })
    symlinkSync(outside, link)
    expect(() => openLocalDb(link, true)).toThrow('.wrangler/state')
  })

  test('readonly で開いたときは書けない', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    db.close()
    const readonly = openLocalDb(path, false)
    expect(() => insertExisting(readonly)).toThrow()
    readonly.close()
  })
})

describe('checkColumns / assertColumns', () => {
  test('書く列がすべてテーブルにあり、必須の列を書き漏らしていない', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    const checks = checkColumns(db)
    expect(checks.map((check) => check.table)).toEqual([
      'events',
      'event_stores',
      'event_reference_urls',
      'event_conditions'
    ])
    for (const check of checks) {
      expect(check.absent).toEqual([])
      expect(check.uncovered).toEqual([])
      expect(check.columns).toBeGreaterThanOrEqual(check.written.length)
    }
    expect(() => assertColumns(checks)).not.toThrow()
    db.close()
  })

  test('テーブルが無い・列が足りない・必須の列を書かないときは止まる', () => {
    const db = new Database(':memory:')
    expect(() => assertColumns(checkColumns(db))).toThrow('table not found')
    db.exec(
      `CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, extra TEXT NOT NULL)`
    )
    const [events] = checkColumns(db)
    expect(events.absent).toContain('start_date')
    expect(events.uncovered).toEqual(['extra'])
    expect(() => assertColumns(checkColumns(db))).toThrow('extra: NOT NULL without default but not written')
    db.close()
  })
})

describe('applySeed', () => {
  test('4 つのテーブルに書き、件数と中身が合う。既存の行は変わらない', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    insertExisting(db)
    const before = dump(db)
    const plans = [
      plan({
        emulatedId: 'a',
        category: 'limited_card',
        title: '夏名刺',
        startDate: '2026-06-30T15:00:00.000Z',
        endDate: '2026-07-30T15:00:00.000Z',
        endedAt: '2026-07-20T15:00:00.000Z',
        limitedQuantity: 100,
        references: [
          { type: 'announce', url: 'https://x.com/bic_kashiwa/status/1', kind: 'original' },
          { type: 'start', url: 'https://x.com/bic_kashiwa/status/2', kind: 'original' },
          { type: 'end', url: 'https://x.com/bic_kashiwa/status/3', kind: 'original' }
        ]
      }),
      plan({
        emulatedId: 'b',
        store: 'kyoto',
        category: 'ackey',
        title: 'アクキー',
        startDay: '2026-10-20',
        startDate: '2026-10-19T15:00:00.000Z',
        isPreliminary: true,
        references: [{ type: 'announce', url: 'https://x.com/Bic_kyoto/status/4', kind: 'original' }]
      })
    ]
    const counter = { next: 0 }
    const newId = () => {
      counter.next += 1
      return `id-${counter.next}`
    }
    const result = applySeed(db, plans, { now: NOW, force: false, newId })
    expect(result.before).toEqual({ events: 1, event_stores: 1, event_reference_urls: 1, event_conditions: 1 })
    expect(result.after).toEqual({ events: 3, event_stores: 3, event_reference_urls: 5, event_conditions: 3 })
    expect(countRows(db)).toEqual(result.after)

    const rows = dump(db)
    // 既存の行は 1 列も変わらない（追加だけ）
    for (const table of ['events', 'event_stores', 'event_reference_urls', 'event_conditions'] as const)
      expect(rows[table].filter((row) => JSON.stringify(before[table]).includes(JSON.stringify(row)))).toEqual(
        before[table]
      )

    const created = db
      .query<
        {
          id: string
          category: string
          title: string
          limited_quantity: number | null
          start_date: string
          end_date: string | null
          ended_at: string | null
          is_verified: number
          is_preliminary: number
          group_id: string | null
          character_id: string | null
          created_at: string
          updated_at: string
        },
        []
      >("SELECT * FROM events WHERE id != 'existing-1' ORDER BY start_date")
      .all()
    expect(created).toHaveLength(2)
    expect(created[0]).toMatchObject({
      category: 'limited_card',
      title: '夏名刺',
      limited_quantity: 100,
      start_date: '2026-06-30T15:00:00.000Z',
      end_date: '2026-07-30T15:00:00.000Z',
      ended_at: '2026-07-20T15:00:00.000Z',
      is_verified: 0,
      is_preliminary: 0,
      group_id: null,
      character_id: null,
      created_at: NOW,
      updated_at: NOW
    })
    expect(created[1]).toMatchObject({
      category: 'ackey',
      title: 'アクキー',
      limited_quantity: null,
      end_date: null,
      ended_at: null,
      is_verified: 0,
      is_preliminary: 1
    })
    for (const row of created) {
      expect(row.start_date).toMatch(/^\d{4}-\d{2}-\d{2}T15:00:00\.000Z$/)
      expect(row.id).toMatch(/^id-\d+$/)
    }

    const stores = db
      .query<{ event_id: string; store_key: string }, []>(
        "SELECT event_id, store_key FROM event_stores WHERE id != 's-1'"
      )
      .all()
    expect(stores.map((row) => row.store_key).sort()).toEqual(['kashiwa', 'kyoto'])
    expect(new Set(stores.map((row) => row.event_id))).toEqual(new Set(created.map((row) => row.id)))

    const urls = db
      .query<{ event_id: string; type: string; url: string }, []>(
        "SELECT event_id, type, url FROM event_reference_urls WHERE id != 'u-1' ORDER BY url"
      )
      .all()
    expect(urls.map((row) => [row.type, row.url])).toEqual([
      // url の昇順（大文字の B が小文字の b より前）
      ['announce', 'https://x.com/Bic_kyoto/status/4'],
      ['announce', 'https://x.com/bic_kashiwa/status/1'],
      ['start', 'https://x.com/bic_kashiwa/status/2'],
      ['end', 'https://x.com/bic_kashiwa/status/3']
    ])

    // 配布条件: 配布数があれば先着（その人数）、無ければ誰でも。購入条件は作らない
    const conditions = db
      .query<{ event_id: string; type: string; purchase_amount: number | null; quantity: number | null }, []>(
        "SELECT event_id, type, purchase_amount, quantity FROM event_conditions WHERE id != 'c-1'"
      )
      .all()
    const byEvent = new Map(conditions.map((row) => [row.event_id, row]))
    expect(byEvent.get(created[0].id)).toMatchObject({ type: 'first_come', purchase_amount: null, quantity: 100 })
    expect(byEvent.get(created[1].id)).toMatchObject({ type: 'everyone', purchase_amount: null, quantity: null })
    expect(conditions.some((row) => row.type === 'purchase')).toBe(false)
    db.close()
  })

  test('途中で失敗したらロールバックして 1 行も残らない', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    insertExisting(db)
    const before = dump(db)
    // 同じ ID を返し続けると 2 件目の INSERT が主キー違反になる
    expect(() =>
      applySeed(db, [plan({ emulatedId: 'a' }), plan({ emulatedId: 'b', startDay: '2026-07-02' })], {
        now: NOW,
        force: false,
        newId: () => 'same-id'
      })
    ).toThrow()
    expect(dump(db)).toEqual(before)
    db.close()
  })

  test('書く直前にローカル D1 へ同じ店舗・開始日が増えていたら止まる（--force を除く）', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    insertExisting(db)
    const before = dump(db)
    // existing-1 は kashiwa の JST 2026-10-04
    const clash = plan({ emulatedId: 'clash', startDay: '2026-10-04', startDate: '2026-10-03T15:00:00.000Z' })
    expect(() => applySeed(db, [clash], { now: NOW, force: false })).toThrow('already in local D1')
    expect(dump(db)).toEqual(before)
    expect(applySeed(db, [clash], { now: NOW, force: true }).after.events).toBe(2)
    db.close()
  })

  test('件数が 0 でも空のトランザクションとして成功する', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    expect(applySeed(db, [], { now: NOW, force: false })).toEqual({ before: countRows(db), after: countRows(db) })
    db.close()
  })
})

describe('readLocalState', () => {
  test('既存イベントの店舗・開始日（JST）を集める。+00:00 形式も読む', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    insertExisting(db)
    expect(readLocalState(db)).toEqual({ storeDays: new Set(['kashiwa|2026-10-04']), invalid: 0 })
    db.close()
  })
})

// ---------------------------------------------------------------------------------------------
// 実行（材料のファイル → 一時 D1）
// ---------------------------------------------------------------------------------------------

const GOLD_UUID = '8f96da7a-0a68-4e15-a765-0559c552e869'

/** emulate の結果・Clef の判定・D1 の正解データ・投稿・characters.json を一時ディレクトリに作る */
const makeMaterials = async (root: string) => {
  const dir = join(root, '.cache', 'event-detect')
  await mkdir(join(dir, 'clef', QUESTION_VERSION), { recursive: true })
  const emulated = [
    // 通る: 夏名刺（kashiwa、7/1）。言及 3 件
    {
      id: 'kashiwa-1',
      store: 'kashiwa',
      item: '柏たん夏限定名刺',
      category: 'limited_card',
      status: 'end',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      endedAt: '2026-07-20',
      quantity: 200,
      startUnknown: false,
      firstSeen: 1,
      lastSeen: RECENT,
      posts: [
        { postId: '1001', status: 'announce', index: 0 },
        { postId: '1002', status: 'start', index: 0 },
        { postId: '1003', status: 'end', index: 0 }
      ]
    },
    // 同じ店舗・開始日・題の重複（言及が少ない）
    {
      id: 'kashiwa-2',
      store: 'kashiwa',
      item: '夏名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-07-01',
      startUnknown: false,
      firstSeen: 5,
      lastSeen: RECENT,
      posts: [{ postId: '1004', status: 'announce', index: 0 }]
    },
    // 通る: 別の店舗のアクキー
    {
      id: 'kyoto-1',
      store: 'kyoto',
      item: '擬人化記念アクリルキーホルダー',
      category: 'ackey',
      status: 'start',
      startDate: '2026-08-01',
      startUnknown: false,
      firstSeen: 6,
      lastSeen: RECENT,
      posts: [{ postId: '2001', status: 'start', index: 0 }]
    },
    // Clef の確率がしきい値未満
    {
      id: 'kyoto-low',
      store: 'kyoto',
      item: '名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-09-01',
      startUnknown: false,
      firstSeen: 7,
      lastSeen: RECENT,
      posts: [{ postId: '2002', status: 'announce', index: 0 }]
    },
    // Clef 未判定
    {
      id: 'kyoto-unjudged',
      store: 'kyoto',
      item: '名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-09-02',
      startUnknown: false,
      firstSeen: 8,
      lastSeen: RECENT,
      posts: [{ postId: '2003', status: 'announce', index: 0 }]
    },
    // D1 の参考 URL と同じ投稿
    {
      id: 'chiba-gold-post',
      store: 'chiba',
      item: 'コラボ名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-09-03',
      startUnknown: false,
      firstSeen: 9,
      lastSeen: RECENT,
      posts: [{ postId: '3001', status: 'announce', index: 0 }]
    },
    // ローカル D1 に同じ店舗・同じ開始日（existing-1: kashiwa の JST 2026-10-04）
    {
      id: 'kashiwa-local',
      store: 'kashiwa',
      item: 'バレンタイン名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-10-04',
      startUnknown: false,
      firstSeen: 10,
      lastSeen: RECENT,
      posts: [{ postId: '4001', status: 'announce', index: 0 }]
    },
    // 開始日が今日（2026-10-09 JST）より後 → is_preliminary
    {
      id: 'chiba-future',
      store: 'chiba',
      item: '千葉駅前店ハロウィン限定名刺',
      category: 'limited_card',
      status: 'announce',
      startDate: '2026-10-25',
      startUnknown: false,
      firstSeen: 11,
      lastSeen: RECENT,
      posts: [{ postId: '5001', status: 'announce', index: 0 }]
    },
    // 期間外
    {
      id: 'kashiwa-old',
      store: 'kashiwa',
      item: '名刺',
      category: 'limited_card',
      status: 'end',
      startDate: '2019-07-01',
      startUnknown: false,
      firstSeen: 12,
      lastSeen: RECENT,
      posts: [{ postId: '6001', status: 'announce', index: 0 }]
    }
  ]
  await writeFile(join(dir, 'emulated-v1.json'), JSON.stringify(emulated))
  const clef = (postId: string, noul: number) => ({
    postId,
    model: 'clef',
    kind: 'event',
    response: { answers: { is_event: { type: 'noul', noul } } }
  })
  const judgements = [
    clef('1001', 0.95),
    clef('1004', 0.8),
    clef('2001', 0.71),
    clef('2002', 0.4),
    clef('3001', 0.99),
    clef('4001', 0.99),
    clef('5001', 0.9),
    clef('6001', 0.99)
  ]
  await Promise.all(
    judgements.map((entry) =>
      writeFile(join(dir, 'clef', QUESTION_VERSION, `${entry.postId}.json`), JSON.stringify(entry))
    )
  )
  await writeFile(
    join(dir, 'gold.json'),
    JSON.stringify({
      fetchedAt: '2026-10-08T00:00:00.000Z',
      source: 'https://biccame-musume.com',
      events: [
        {
          uuid: GOLD_UUID,
          title: 'ビッカメ娘11周年記念名刺',
          category: 'limited_card',
          stores: ['osaka'],
          startDate: '2026-04-30T15:00:00.000Z',
          conditions: [],
          isPreliminary: false,
          referenceUrls: [{ type: 'announce', url: 'https://x.com/bic_chiba/status/3001' }]
        }
      ]
    })
  )
  const post = (id: string, screenName: string) =>
    JSON.stringify({ id, screenName, kind: 'original', createdAt: '2026-07-01T00:00:00.000Z' })
  await writeFile(
    join(dir, 'posts.jsonl'),
    `${[
      post('1001', 'bic_kashiwa'),
      post('1002', 'bic_kashiwa'),
      post('1003', 'Bic_Kashiwa'),
      post('1004', 'bic_kashiwa'),
      post('2001', 'bic_kyoto'),
      post('4001', 'bic_kashiwa'),
      post('5001', 'bic_chiba'),
      post('9999', 'someone_else')
    ].join('\n')}\n`
  )
  const charactersPath = join(root, 'characters.json')
  await writeFile(
    charactersPath,
    JSON.stringify([
      { id: 'kashiwa', character: { name: '柏たん', is_biccame_musume: true }, store: { name: 'ビックカメラ柏店' } },
      { id: 'kyoto', character: { name: '京都たん', is_biccame_musume: true } },
      {
        id: 'chiba',
        character: { name: '千葉たん', is_biccame_musume: true },
        store: { name: 'ビックカメラ千葉駅前店' }
      },
      { id: 'biccamera', character: { name: 'ビックカメラ', is_biccame_musume: false } }
    ])
  )
  return { dir, charactersPath }
}

const runOptions = (
  root: string,
  materials: Awaited<ReturnType<typeof makeMaterials>>,
  dbPath: string,
  extra: Partial<SeedRunOptions> = {}
): SeedRunOptions => ({
  dir: materials.dir,
  cacheRoot: join(root, '.cache'),
  charactersPath: materials.charactersPath,
  dbPath,
  apply: false,
  threshold: 0.7,
  since: '2023-01-01',
  force: false,
  reportPath: join(root, '.cache', 'event-detect', 'seed-report.json'),
  now: NOW,
  // 既存のテストはルールベースの題の挙動を確かめる（命名は seed-title.test.ts）
  titles: 'rule',
  ...extra
})

describe('runSeed', () => {
  test('dry-run は DB を開いても書かず、レポートだけを書く', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    insertExisting(db)
    const before = dump(db)
    db.close()
    const materials = await makeMaterials(root)
    const options = runOptions(root, materials, path)
    const run = await runSeed(options)

    expect(run.applied).toBeUndefined()
    expect(run.selection.plans.map((entry) => `${entry.store} ${entry.startDay} ${entry.title}`)).toEqual([
      'chiba 2026-10-25 ハロウィン名刺',
      'kyoto 2026-08-01 擬人化記念アクリルキーホルダー',
      'kashiwa 2026-07-01 夏名刺'
    ])
    expect(run.counts).toEqual({ events: 1, event_stores: 1, event_reference_urls: 1, event_conditions: 1 })
    expect(run.selection.stages.map((stage) => [stage.excluded, stage.remaining])).toEqual([
      [0, 9], // emulate のイベント
      [1, 8], // Clef の判定がある（kyoto-unjudged が未判定）
      [1, 7], // 確率 0.7 以上（kyoto-low が 0.4）
      [0, 7], // 開始日がある
      [1, 6], // 期間（kashiwa-old が 2019）
      [1, 5], // D1 の参考 URL と同じ投稿（chiba-gold-post）
      [0, 5], // D1 に同じ店舗・同じ開始日
      [1, 4], // ローカル D1 に同じ店舗・同じ開始日（kashiwa-local）
      [0, 4], // 最初の告知・開始の言及がリプライではない
      [0, 4], // 参考 URL を作れる
      [0, 4], // 店舗キー（characters.json）
      [0, 4], // ビッカメ娘の店舗である
      [0, 4], // 店舗キー（アプリの StoreKeySchema）
      [0, 4], // 終了が分からないまま止まっていない
      [0, 4], // 題を付けられる（--titles rule はゲートをかけない）
      [1, 3], // 重複（kashiwa-2）
      [0, 3] // --limit
    ])
    expect(run.selection.duplicates.dropped).toBe(1)

    // 書いていない
    const check = new Database(path, { readonly: true })
    expect(dump(check)).toEqual(before)
    check.close()
    expect(readdirSync(materials.dir).filter((name) => name.startsWith('seed-backup-'))).toEqual([])

    const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
    expect(report.mode).toBe('dry-run')
    expect(report.events).toHaveLength(3)
    expect(report.events[2]).toMatchObject({
      title: '夏名刺',
      item: '柏たん夏限定名刺',
      store: 'kashiwa',
      category: 'limited_card',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      endedAt: '2026-07-20',
      clef: 0.95,
      mentions: 3,
      emulatedId: 'kashiwa-1'
    })
    expect(report.events[2].referenceUrls).toEqual([
      { type: 'announce', url: 'https://x.com/bic_kashiwa/status/1001', kind: 'original' },
      { type: 'start', url: 'https://x.com/bic_kashiwa/status/1002', kind: 'original' },
      { type: 'end', url: 'https://x.com/Bic_Kashiwa/status/1003', kind: 'original' }
    ])
    const lines = describeSeed(options, run).join('\n')
    expect(lines).toContain('--dry-run')
    expect(lines).toContain('書き込みなし')
    expect(lines).toContain('[柏たん夏限定名刺] → 夏名刺')
  })

  test('--apply はバックアップを取って書く。2 回目は 0 件追加（冪等）で、既存の行は変わらない', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    insertExisting(db)
    const before = dump(db)
    db.close()
    const materials = await makeMaterials(root)

    const first = await runSeed(runOptions(root, materials, path, { apply: true }))
    expect(first.applied).toBeDefined()
    expect(first.applied?.before).toEqual({ events: 1, event_stores: 1, event_reference_urls: 1, event_conditions: 1 })
    // 既存 1 件 + kashiwa（参考 URL 3 件）+ kyoto（1 件）+ chiba（1 件）
    expect(first.applied?.after).toEqual({ events: 4, event_stores: 4, event_reference_urls: 6, event_conditions: 4 })

    // バックアップは書く前の状態（VACUUM INTO）
    const backupPath = first.applied?.backupPath
    if (backupPath === undefined) throw new Error('no backup')
    expect(backupPath.startsWith(join(materials.dir, 'seed-backup-'))).toBe(true)
    expect(backupPath.endsWith('.sqlite')).toBe(true)
    const backup = new Database(backupPath, { readonly: true })
    expect(dump(backup)).toEqual(before)
    backup.close()

    const written = new Database(path, { readonly: true })
    const rows = written
      .query<{ title: string; is_verified: number; is_preliminary: number; start_date: string }, []>(
        "SELECT title, is_verified, is_preliminary, start_date FROM events WHERE id != 'existing-1' ORDER BY start_date"
      )
      .all()
    expect(rows).toEqual([
      { title: '夏名刺', is_verified: 0, is_preliminary: 0, start_date: '2026-06-30T15:00:00.000Z' },
      {
        title: '擬人化記念アクリルキーホルダー',
        is_verified: 0,
        is_preliminary: 0,
        start_date: '2026-07-31T15:00:00.000Z'
      },
      { title: 'ハロウィン名刺', is_verified: 0, is_preliminary: 1, start_date: '2026-10-24T15:00:00.000Z' }
    ])
    // 既存の人が検証した行はそのまま
    const existing = written.query('SELECT * FROM events WHERE id = ?').get('existing-1')
    expect(existing).toEqual(before.events[0])
    const afterFirst = dump(written)
    written.close()

    const second = await runSeed(runOptions(root, materials, path, { apply: true, now: '2026-10-09T03:05:00.000Z' }))
    expect(second.selection.plans).toEqual([])
    expect(second.applied).toBeUndefined()
    const again = new Database(path, { readonly: true })
    expect(dump(again)).toEqual(afterFirst)
    again.close()
  })

  test('--force はローカル D1 との照合を省く', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    insertExisting(db)
    db.close()
    const materials = await makeMaterials(root)
    const normal = await runSeed(runOptions(root, materials, path))
    const forced = await runSeed(runOptions(root, materials, path, { force: true }))
    // existing-1 と同じ kashiwa の 2026-10-04 は --force のときだけ残る
    expect(normal.selection.plans.some((entry) => entry.emulatedId === 'kashiwa-local')).toBe(false)
    expect(forced.selection.plans.some((entry) => entry.emulatedId === 'kashiwa-local')).toBe(true)
  })

  test('--limit で開始日の新しい順に絞る', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    db.close()
    const materials = await makeMaterials(root)
    const run = await runSeed(runOptions(root, materials, path, { limit: 1 }))
    expect(run.selection.plans.map((entry) => entry.emulatedId)).toEqual(['chiba-future'])
  })

  test('.wrangler/state の外の DB・.cache の外のレポートは拒否する', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    db.close()
    const materials = await makeMaterials(root)
    await expect(runSeed(runOptions(root, materials, join(root, 'prod.sqlite')))).rejects.toThrow('.wrangler/state')
    await expect(runSeed(runOptions(root, materials, path, { reportPath: join(root, 'report.json') }))).rejects.toThrow(
      '--report must be under'
    )
    expect(existsSync(join(root, 'report.json'))).toBe(false)
  })

  test('マイグレーション未適用の DB（テーブルが無い）は書く前に止まる', async () => {
    const root = await tempDir()
    const path = join(root, '.wrangler', 'state', 'v3', 'd1', 'empty.sqlite')
    await mkdir(dirname(path), { recursive: true })
    new Database(path, { create: true }).close()
    const materials = await makeMaterials(root)
    await expect(runSeed(runOptions(root, materials, path, { apply: true }))).rejects.toThrow('table not found')
    expect(statSync(path).size).toBeGreaterThanOrEqual(0)
    expect(readdirSync(materials.dir).filter((name) => name.startsWith('seed-'))).toEqual([])
  })

  test('emulate の結果が無ければ emulate の実行を促して止まる', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    db.close()
    const materials = await makeMaterials(root)
    await rm(join(materials.dir, 'emulated-v1.json'))
    await expect(runSeed(runOptions(root, materials, path))).rejects.toThrow('run emulate')
  })
})

describe('runSeed（--titles llm。偽の endpoint）', () => {
  const endpoint = { url: 'http://127.0.0.1/unused', token: 't' }

  /** posts.jsonl に本文を足す（makeMaterials の投稿は本文なし） */
  const withBodies = async (materials: Awaited<ReturnType<typeof makeMaterials>>) => {
    const post = (id: string, screenName: string, text: string) =>
      JSON.stringify({ id, screenName, kind: 'original', createdAt: '2026-07-01T00:00:00.000Z', text })
    await writeFile(
      join(materials.dir, 'posts.jsonl'),
      `${[
        post('1001', 'bic_kashiwa', '柏たんの夏名刺を配布します'),
        post('1002', 'bic_kashiwa', '本日から配布開始'),
        post('1003', 'Bic_Kashiwa', '配布終了'),
        post('1004', 'bic_kashiwa', '夏名刺'),
        post('2001', 'bic_kyoto', '京都たんのアクキー'),
        post('4001', 'bic_kashiwa', 'バレンタイン'),
        post('5001', 'bic_chiba', '千葉駅前店のハロウィン名刺')
      ].join('\n')}\n`
    )
  }

  const ITEM_LINE = /配布物の名前（投稿から読み取ったもの）: ([^\n]*)/

  /** 状態の「配布物の名前」ごとに題を返す偽の fetch。answers に無い item は 400（再試行しない失敗） */
  const fakeFetch = (answers: Record<string, string>) => {
    const preconnect = globalThis.fetch.preconnect
    const states: string[] = []
    const spy = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const state: string = JSON.parse(String(init?.body)).messages[0].content
          states.push(state)
          const item = ITEM_LINE.exec(state)?.[1]
          const title = item === undefined ? undefined : answers[item]
          return title === undefined
            ? Response.json({ error: 'bad request' }, { status: 400 })
            : Response.json({
                content: [{ type: 'tool_use', name: 'answer', input: { title } }],
                usage: { input_tokens: 100, output_tokens: 10 }
              })
        },
        { preconnect }
      )
    )
    return { states, spy }
  }

  const answers: Record<string, string> = {
    柏たん夏限定名刺: '夏名刺',
    // 重複（kashiwa-2）。同じ題になるので 1 件にまとまる
    夏名刺: '夏名刺',
    擬人化記念アクリルキーホルダー: '擬人化記念アクキー(京都たん)',
    千葉駅前店ハロウィン限定名刺: 'ハロウィン名刺'
  }

  test('偽の endpoint で命名し、検査落ちはルールの題。レポートに題の経緯が残る。2 回目は呼ばない', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    // kashiwa の 2026-10-04 は既存（照合で除かれる）にして、他の runSeed のテストと同じ 3 件にする
    insertExisting(db)
    db.close()
    const materials = await makeMaterials(root)
    await withBodies(materials)
    const options = runOptions(root, materials, path, { titles: 'llm', endpoint, concurrency: 2 })
    const first = fakeFetch(answers)
    try {
      const run = await runSeed(options)
      // 呼んだのは 4 件（kashiwa-1 / kashiwa-2 / kyoto-1 / chiba-future）
      expect(first.states).toHaveLength(4)
      expect(run.selection.naming).toMatchObject({ requests: 4, called: 4, cached: 0, failed: 0 })
      expect(
        run.selection.plans.map((plan) => `${plan.store} ${plan.startDay} ${plan.title} (${plan.titleSource})`)
      ).toEqual([
        'chiba 2026-10-25 ハロウィン名刺 (llm)',
        // 括弧つきの題は落ちて、ルールの題（キャラ名を除いただけ）になる
        'kyoto 2026-08-01 擬人化記念アクリルキーホルダー (fallback)',
        'kashiwa 2026-07-01 夏名刺 (llm)'
      ])
      expect(run.selection.plans[1]).toMatchObject({
        ruleTitle: '擬人化記念アクリルキーホルダー',
        llmTitle: '擬人化記念アクキー(京都たん)',
        titleReject: 'bracket(()'
      })
      // 代表的な投稿本文が posts.jsonl から入る
      const kashiwa = first.states.find((state) => state.includes('柏たん夏限定名刺'))
      expect(kashiwa).toContain('投稿本文（告知）:\n柏たんの夏名刺を配布します')
      expect(kashiwa).toContain('投稿本文（開始）:\n本日から配布開始')
      expect(kashiwa).toContain('入れてはいけない語（この店舗のキャラ名・店舗名）: 柏たん、柏店')
      const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
      expect(report).toMatchObject({ titles: 'llm', titleModel: { model: 'claude-haiku-5-5', version: 'v1' } })
      expect(report.events.map((event: { titleSource: string }) => event.titleSource)).toEqual([
        'llm',
        'fallback',
        'llm'
      ])
      expect(report.events[1]).toMatchObject({
        title: '擬人化記念アクリルキーホルダー',
        ruleTitle: '擬人化記念アクリルキーホルダー',
        llmTitle: '擬人化記念アクキー(京都たん)',
        titleReject: 'bracket(()'
      })
      expect(report.naming.fallbacks.bracket).toBe(1)
      const lines = describeSeed(options, run).join('\n')
      expect(lines).toContain('titles=llm')
      expect(lines).toContain('命名（claude-haiku-5-5 / v1）')
      expect(lines).toContain('概算 $')
      expect(lines).toContain('[柏たん夏限定名刺] → 夏名刺')
      // 保存先は seed-title/<モデル>/<バージョン>
      expect(readdirSync(join(materials.dir, 'seed-title', 'claude-haiku-5-5', 'v1'))).toHaveLength(4)
    } finally {
      first.spy.mockRestore()
    }
    // 後の --apply は呼ばずに、保存した題で書く
    const second = fakeFetch({})
    try {
      const applied = await runSeed({ ...options, apply: true })
      expect(second.states).toHaveLength(0)
      expect(applied.selection.naming).toMatchObject({ requests: 4, called: 0, cached: 4, failed: 0 })
      expect(applied.applied?.after.events).toBe(4)
      const written = new Database(path, { readonly: true })
      expect(
        written
          .query<{ title: string }, []>("SELECT title FROM events WHERE id != 'existing-1' ORDER BY start_date")
          .all()
          .map((row) => row.title)
      ).toEqual(['夏名刺', '擬人化記念アクリルキーホルダー', 'ハロウィン名刺'])
      written.close()
    } finally {
      second.spy.mockRestore()
    }
  })

  test('gold.json の同名の企画と配布物の種別が違う題は採用せず、ルールの題に戻す。レポートとログに残る', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    insertExisting(db)
    db.close()
    const materials = await makeMaterials(root)
    await withBodies(materials)
    // gold.json の「ビッカメ娘11周年記念名刺」は limited_card。kyoto のアクキー（ackey）には付けられない
    const stub = fakeFetch({ ...answers, 擬人化記念アクリルキーホルダー: 'ビッカメ娘11周年記念名刺' })
    try {
      const options = runOptions(root, materials, path, { titles: 'llm', endpoint, concurrency: 2 })
      const run = await runSeed(options)
      expect(run.selection.plans.find((plan) => plan.emulatedId === 'kyoto-1')).toMatchObject({
        title: '擬人化記念アクリルキーホルダー',
        ruleTitle: '擬人化記念アクリルキーホルダー',
        llmTitle: 'ビッカメ娘11周年記念名刺',
        titleSource: 'fallback',
        titleReject: 'category(D1=limited_card 今回=ackey)'
      })
      expect(run.selection.naming?.fallbacks).toMatchObject({ category: 1, bracket: 0 })
      const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
      expect(report.naming.fallbacks.category).toBe(1)
      expect(report.naming.rejects[0]).toMatchObject({ reason: 'category', title: '擬人化記念アクリルキーホルダー' })
      const lines = describeSeed(options, run)
      expect(lines).toContain('  D1 の同名の企画とは配布物の種別が違うため、ルールの題に戻した: 1 件')
      expect(lines.join('\n')).toContain('命名=ビッカメ娘11周年記念名刺 理由=category(D1=limited_card 今回=ackey)')
    } finally {
      stub.spy.mockRestore()
    }
  })

  test('ルールの題に戻した題が品質ゲートに落ちたイベントは作らない。段階表・ログ・レポートに残る', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    insertExisting(db)
    db.close()
    const materials = await makeMaterials(root)
    await withBodies(materials)
    // kyoto-1 の item を、括弧つきのルールの題になるものに差し替える
    const emulatedPath = join(materials.dir, 'emulated-v1.json')
    const emulated: { id: string; item: string }[] = JSON.parse(await readFile(emulatedPath, 'utf8'))
    await writeFile(
      emulatedPath,
      JSON.stringify(
        emulated.map((event) => (event.id === 'kyoto-1' ? { ...event, item: '京都たんの夏名刺（臨時）' } : event))
      )
    )
    // Haiku の題は括弧つきで落ちる → ルールの題「夏名刺(臨時)」も括弧つきでゲートに落ちる
    const stub = fakeFetch({ ...answers, '京都たんの夏名刺（臨時）': '夏名刺（臨時）' })
    try {
      const options = runOptions(root, materials, path, { titles: 'llm', endpoint, concurrency: 2 })
      const run = await runSeed(options)
      expect(run.selection.plans.map((plan) => plan.emulatedId)).toEqual(['chiba-future', 'kashiwa-1'])
      expect(run.selection.untitled).toEqual([
        {
          emulatedId: 'kyoto-1',
          store: 'kyoto',
          startDay: '2026-08-01',
          item: '京都たんの夏名刺（臨時）',
          ruleTitle: '夏名刺(臨時)',
          llmTitle: '夏名刺(臨時)',
          reason: 'bracket(()'
        }
      ])
      const gate = run.selection.stages.find((stage) => stage.label.startsWith('題を付けられる'))
      expect(gate).toMatchObject({ excluded: 1, remaining: 3 })
      const labels = run.selection.stages.map((stage) => stage.label)
      expect(labels.findIndex((label) => label.startsWith('題を付けられる'))).toBe(
        labels.findIndex((label) => label.startsWith('同じ店舗・開始日・題')) - 1
      )
      const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
      expect(report.untitled).toEqual(run.selection.untitled)
      expect(report.naming.rejects[0]).toMatchObject({ reason: 'bracket', gate: 'bracket(()' })
      const lines = describeSeed(options, run).join('\n')
      expect(lines).toContain(
        '題を付けられず作らなかった LLM イベント（ルールの題に戻した題が品質ゲートに落ちた）: 1 件'
      )
      expect(lines).toContain(
        'kyoto 2026-08-01 [京都たんの夏名刺（臨時）] ルールの題=夏名刺(臨時) 命名=夏名刺(臨時) 理由=bracket(()'
      )
      expect(lines).toContain('題を付けられる（ルールの題に戻したものは品質検査に通る）')
    } finally {
      stub.spy.mockRestore()
    }
  })

  test('命名に失敗が残ったまま --apply はしない（題は後から直せない）。dry-run は失敗分をルールの題にして続ける', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    // kashiwa の 2026-10-04 は既存（照合で除かれる）にして、他の runSeed のテストと同じ 3 件にする
    insertExisting(db)
    db.close()
    const materials = await makeMaterials(root)
    await withBodies(materials)
    const { 千葉駅前店ハロウィン限定名刺: _failing, ...partial } = answers
    const stub = fakeFetch(partial)
    try {
      const dry = await runSeed(runOptions(root, materials, path, { titles: 'llm', endpoint, concurrency: 1 }))
      expect(dry.selection.naming).toMatchObject({ failed: 1, called: 3 })
      expect(dry.selection.naming?.fallbacks.call_failed).toBe(1)
      expect(dry.selection.plans.find((plan) => plan.emulatedId === 'chiba-future')).toMatchObject({
        title: 'ハロウィン名刺',
        titleSource: 'fallback',
        titleReject: 'call_failed',
        llmTitle: null
      })
      await expect(
        runSeed(runOptions(root, materials, path, { titles: 'llm', endpoint, concurrency: 1, apply: true }))
      ).rejects.toThrow('naming failed for 1 request')
      const check = new Database(path, { readonly: true })
      expect(countRows(check).events).toBe(1)
      check.close()
    } finally {
      stub.spy.mockRestore()
    }
  })

  test('--titles rule は命名せず（endpoint も要らず）、題の出どころは rule', async () => {
    const root = await tempDir()
    const { db, path } = await makeLocalDb(root)
    db.close()
    const materials = await makeMaterials(root)
    const stub = fakeFetch({})
    try {
      const run = await runSeed(runOptions(root, materials, path, { titles: 'rule' }))
      expect(stub.states).toHaveLength(0)
      expect(run.selection.naming).toBeUndefined()
      expect(run.selection.plans.every((plan) => plan.titleSource === 'rule' && plan.title === plan.ruleTitle)).toBe(
        true
      )
      expect(existsSync(join(materials.dir, 'seed-title'))).toBe(false)
    } finally {
      stub.spy.mockRestore()
    }
  })
})

describe('配布数の下限（MIN_LIMITED_QUANTITY）', () => {
  test('9 は捨てて配布条件を everyone に、10 は使って first_come にする（選別 → 書き込み）', async () => {
    const root = await tempDir()
    const { db } = await makeLocalDb(root)
    const events = [
      seedEvent({ id: 'nine', quantity: 9, startDate: '2026-07-01' }),
      seedEvent({ id: 'ten', quantity: 10, startDate: '2026-07-02' }),
      seedEvent({ id: 'one', quantity: 1, startDate: '2026-07-03' })
    ]
    const selection = await selectSeedEvents(baseOptions(events, { 'nine-1': 1, 'ten-1': 1, 'one-1': 1 }))
    expect(MIN_LIMITED_QUANTITY).toBe(10)
    expect(selection.discardedQuantities.count).toBe(2)
    applySeed(db, selection.plans, { now: NOW, force: false })
    const rows = db
      .query<
        { title: string; start_date: string; limited_quantity: number | null; type: string; quantity: number | null },
        []
      >(
        'SELECT e.title, e.start_date, e.limited_quantity, c.type, c.quantity FROM events e JOIN event_conditions c ON c.event_id = e.id ORDER BY e.start_date'
      )
      .all()
    expect(rows.map((row) => [row.start_date, row.limited_quantity, row.type, row.quantity])).toEqual([
      ['2026-06-30T15:00:00.000Z', null, 'everyone', null], // 9
      ['2026-07-01T15:00:00.000Z', 10, 'first_come', 10], // 10
      ['2026-07-02T15:00:00.000Z', null, 'everyone', null] // 1
    ])
    db.close()
  })
})

describe('assertInside', () => {
  test('root の下だけ許す（root そのもの・兄弟のディレクトリは不可）', () => {
    expect(assertInside('/a/.cache', '/a/.cache/event-detect/x.json', '--report')).toBe('/a/.cache/event-detect/x.json')
    expect(() => assertInside('/a/.cache', '/a/.cache', '--report')).toThrow('--report must be under')
    expect(() => assertInside('/a/.cache', '/a/.cache-other/x.json', '--report')).toThrow('--report must be under')
    expect(() => assertInside('/a/.cache', '/a/x.json', '--report')).toThrow('--report must be under')
  })
})
