import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkTitle,
  isExampleTitle,
  MIN_LIMITED_QUANTITY,
  normalizeTitle,
  type SeedEvent,
  seedNameTerms,
  selectSeedEvents,
  squeezeJapaneseSpaces
} from '../../scripts/lib/event-detect/seed'
import {
  BODY_LIMIT,
  BODY_POSTS,
  bodyCandidateIds,
  buildTitleTarget,
  EXAMPLE_PER_CATEGORY,
  EXAMPLE_TOP,
  type Mention,
  pickBodies,
  readTitle,
  runTitles,
  TITLE_MAX_LENGTH,
  TITLE_VERSION,
  type TitleRun,
  type TitleSubject,
  type TitleTarget,
  titleCost,
  titleExamples,
  titleKey,
  titleState,
  titleSystem
} from '../../scripts/lib/event-detect/seed-title'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempDir = async () => {
  const path = await mkdtemp(join(tmpdir(), 'event-detect-seed-title-'))
  directories.push(path)
  return path
}

// ---------------------------------------------------------------------------------------------
// 手本（D1 の正解データ）
// ---------------------------------------------------------------------------------------------

const gold = (title: string, count: number, category = 'limited_card') =>
  Array.from({ length: count }, () => ({ title, category }))

describe('titleExamples', () => {
  const events = [
    ...gold('缶バッジで繋ぐビッカメ娘旅', 50, 'other'),
    ...gold('ビッカメ娘11周年記念名刺', 40),
    ...gold('コラボ名刺', 14),
    ...gold('バレンタイン名刺', 14),
    ...gold('擬人化10周年記念アクキー', 10, 'ackey'),
    ...gold('通常名刺', 7, 'regular_card'),
    // 規則に反する古い登録（括弧・キャラ名）は手本に載せない
    ...gold('店舗誕生25周年記念アクスタ(再配布)', 30, 'other'),
    ...gold('川崎たんアクリルスタンド', 20, 'other')
  ]
  const accept = (title: string) => checkTitle(normalizeTitle(title), ['川崎たん']).ok

  test('D1 のタイトルを出現数の多い順に（同数は文字コード順）、件数つきで並べる', () => {
    expect(titleExamples(events, accept).top).toEqual([
      { title: '缶バッジで繋ぐビッカメ娘旅', count: 50 },
      { title: 'ビッカメ娘11周年記念名刺', count: 40 },
      { title: 'コラボ名刺', count: 14 },
      { title: 'バレンタイン名刺', count: 14 },
      { title: '擬人化10周年記念アクキー', count: 10 },
      { title: '通常名刺', count: 7 }
    ])
  })

  test('規則に反する登録（括弧・キャラ名）は手本から外す', () => {
    const titles = titleExamples(events, accept).top.map((entry) => entry.title)
    expect(titles).not.toContain('店舗誕生25周年記念アクスタ(再配布)')
    expect(titles).not.toContain('川崎たんアクリルスタンド')
  })

  test('カテゴリごとの代表例は、そのカテゴリで出現数の多い順', () => {
    const { byCategory } = titleExamples(events, accept)
    expect(byCategory.limited_card).toEqual(['ビッカメ娘11周年記念名刺', 'コラボ名刺', 'バレンタイン名刺'])
    expect(byCategory.ackey).toEqual(['擬人化10周年記念アクキー'])
    expect(byCategory.regular_card).toEqual(['通常名刺'])
    expect(byCategory.other).toEqual(['缶バッジで繋ぐビッカメ娘旅'])
  })

  test('件数の上限（全体 60 件・カテゴリごと 5 件）で切る', () => {
    const many = Array.from({ length: 80 }, (_, index) => gold(`名刺${String(index).padStart(2, '0')}`, 1)).flat()
    const examples = titleExamples(many, () => true)
    expect(examples.top).toHaveLength(EXAMPLE_TOP)
    expect(EXAMPLE_TOP).toBe(60)
    expect(examples.byCategory.limited_card).toHaveLength(EXAMPLE_PER_CATEGORY)
  })

  test('同じ入力なら同じ手本になる（並びは入力の順に依らない）', () => {
    expect(titleExamples([...events].reverse(), accept)).toEqual(titleExamples(events, accept))
  })
})

describe('titleSystem', () => {
  const system = titleSystem(
    titleExamples([...gold('ビッカメ娘11周年記念名刺', 40), ...gold('通常名刺', 7, 'regular_card')], () => true)
  )

  test('D1 のタイトルが件数つきで入る', () => {
    expect(system).toContain('- ビッカメ娘11周年記念名刺（40）')
    expect(system).toContain('- 通常名刺（7）')
    expect(system).toContain('- regular_card（通年配布の通常名刺）: 通常名刺')
  })

  test('命名の規則 6 つが入る', () => {
    expect(system).toContain('「（季節・行事・記念名）＋（配布物）」の短い名詞句')
    expect(system).toContain('キャラ名（○○たん）・店舗名・地名は入れない')
    expect(system).toContain('「ビッカメ娘」は入れてよい')
    expect(system).toContain('括弧（() （） []）・【】・「」で補足を付けない')
    expect(system).toContain('「配布」「プレゼント」「開始」「先行」「追加」「イベント」「デザイン」「ver」')
    expect(system).toContain('「例のアレ」「2月のアレ」')
    expect(system).toContain('登録済みのタイトルに同じ企画の名前があれば')
    expect(system).toContain(`${TITLE_MAX_LENGTH} 文字以内`)
    expect(system).toContain('answer ツールを必ず 1 回呼び')
  })
})

// ---------------------------------------------------------------------------------------------
// 状態（イベント 1 件）
// ---------------------------------------------------------------------------------------------

const mention = (postId: string, status: Mention['status']): Mention => ({ postId, status })

describe('pickBodies', () => {
  const texts = new Map([
    ['a1', '告知 1'],
    ['a2', '告知 2'],
    ['s1', '開始 1'],
    ['o1', '配布中 1'],
    ['e1', '終了 1']
  ])

  test('告知と開始の最初の投稿を優先して最大 2 件', () => {
    const bodies = pickBodies(
      [mention('o1', 'ongoing'), mention('a1', 'announce'), mention('a2', 'announce'), mention('s1', 'start')],
      texts
    )
    expect(bodies).toEqual([
      { status: 'announce', text: '告知 1' },
      { status: 'start', text: '開始 1' }
    ])
    expect(BODY_POSTS).toBe(2)
  })

  test('開始が無ければ告知を 2 件、告知・開始が 1 件しか無ければ配布中・終了で補う', () => {
    expect(pickBodies([mention('a1', 'announce'), mention('a2', 'announce'), mention('e1', 'end')], texts)).toEqual([
      { status: 'announce', text: '告知 1' },
      { status: 'announce', text: '告知 2' }
    ])
    expect(pickBodies([mention('a1', 'announce'), mention('o1', 'ongoing'), mention('e1', 'end')], texts)).toEqual([
      { status: 'announce', text: '告知 1' },
      { status: 'ongoing', text: '配布中 1' }
    ])
  })

  test('本文が引けない投稿は飛ばし、次の投稿を使う', () => {
    expect(
      pickBodies([mention('missing', 'announce'), mention('a2', 'announce'), mention('s1', 'start')], texts)
    ).toEqual([
      { status: 'announce', text: '告知 2' },
      { status: 'start', text: '開始 1' }
    ])
    expect(pickBodies([mention('missing', 'announce')], texts)).toEqual([])
  })

  test('本文は 600 文字（コードポイント）までに切る', () => {
    const long = new Map([['a1', `${'あ'.repeat(BODY_LIMIT - 1)}😀${'い'.repeat(50)}`]])
    const [body] = pickBodies([mention('a1', 'announce')], long)
    expect([...body.text]).toHaveLength(BODY_LIMIT)
    expect(body.text.endsWith('😀')).toBe(true)
    const short = new Map([['a1', 'あ'.repeat(BODY_LIMIT)]])
    expect([...pickBodies([mention('a1', 'announce')], short)[0].text]).toHaveLength(BODY_LIMIT)
  })
})

describe('bodyCandidateIds', () => {
  test('状態ごとに先頭 2 件までの投稿 ID（投稿が多いイベントで全部は引かない）', () => {
    const mentions = [
      ...Array.from({ length: 5 }, (_, index) => mention(`a${index}`, 'announce')),
      mention('s0', 'start'),
      ...Array.from({ length: 5 }, (_, index) => mention(`e${index}`, 'end'))
    ]
    expect(bodyCandidateIds(mentions)).toEqual(['a0', 'a1', 's0', 'e0', 'e1'])
  })
})

const subject = (init: Partial<TitleSubject> = {}): TitleSubject => ({
  item: '2月のアレ（バレンタイン）限定名刺',
  category: 'limited_card',
  startDay: '2024-02-01',
  forbidden: ['柏たん', '柏店'],
  bodies: [{ status: 'announce', text: 'バレンタインの名刺を配布します' }],
  ...init
})

describe('titleState', () => {
  test('item・カテゴリ（日本語の意味つき）・開始日（月つき）・禁止語・本文が入る', () => {
    const state = titleState(subject())
    expect(state).toContain('配布物の名前（投稿から読み取ったもの）: 2月のアレ（バレンタイン）限定名刺')
    expect(state).toContain('カテゴリ: limited_card（期間限定・数量限定・記念の名刺）')
    expect(state).toContain('開始日: 2024-02-01（2月）')
    expect(state).toContain('入れてはいけない語（この店舗のキャラ名・店舗名）: 柏たん、柏店')
    expect(state).toContain('投稿本文（告知）:\nバレンタインの名刺を配布します')
  })

  test('月は 0 埋めの 2 桁でも 1 桁で表す。本文が無いときは取得できなかったと書く', () => {
    expect(titleState(subject({ startDay: '2026-07-07', bodies: [] }))).toContain('開始日: 2026-07-07（7月）')
    expect(titleState(subject({ bodies: [] }))).toContain('投稿本文: （取得できなかった）')
    expect(titleState(subject({ forbidden: [] }))).toContain(
      '入れてはいけない語（この店舗のキャラ名・店舗名）: （なし）'
    )
  })
})

describe('titleKey / buildTitleTarget', () => {
  test('リクエストの内容が同じなら同じキー、変われば別のキー', () => {
    const a = buildTitleTarget('SYS', subject())
    expect(buildTitleTarget('SYS', subject()).key).toBe(a.key)
    expect(a.key).toMatch(/^[0-9a-f]{32}$/)
    expect(buildTitleTarget('SYS2', subject()).key).not.toBe(a.key)
    expect(buildTitleTarget('SYS', subject({ item: '別の名刺' })).key).not.toBe(a.key)
    expect(buildTitleTarget('SYS', subject({ forbidden: ['京都たん'] })).key).not.toBe(a.key)
    expect(buildTitleTarget('SYS', subject({ bodies: [] })).key).not.toBe(a.key)
    expect(titleKey(a.request)).toBe(a.key)
  })

  test('リクエストの中身は system と state だけ（実行時刻のような実行ごとに変わる値を含まない）', () => {
    expect(Object.keys(buildTitleTarget('SYS', subject()).request).sort()).toEqual(['state', 'system'])
  })
})

describe('titleCost', () => {
  test('judge と同じ単価（入力 $0.10 / 出力 $0.50 per 1M）', () => {
    expect(titleCost(1_000_000, 1_000_000)).toBeCloseTo(0.6, 10)
    expect(titleCost(0, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------
// 出力の検査
// ---------------------------------------------------------------------------------------------

describe('checkTitle', () => {
  const terms = ['柏たん', '柏店', '千葉駅前店']

  test('D1 流の短い名詞句は通る（ビッカメ娘・ビックカメラは入れてよい）', () => {
    for (const title of [
      'バレンタイン名刺',
      'ビッカメ娘11周年記念名刺',
      'ビックカメラギフトカード',
      '缶バッジで繋ぐビッカメ娘旅',
      '擬人化10周年記念アクキー',
      'ステージパス風ステッカー'
    ])
      expect(checkTitle(title, terms)).toEqual({ ok: true })
  })

  test('空は落ちる', () => {
    expect(checkTitle('', terms)).toEqual({ ok: false, reason: 'empty', detail: '' })
    expect(checkTitle(normalizeTitle('  \n '), terms)).toEqual({ ok: false, reason: 'empty', detail: '' })
  })

  test('30 文字ちょうどは通り、31 文字は落ちる（文字数はコードポイント）', () => {
    expect(checkTitle('あ'.repeat(TITLE_MAX_LENGTH), terms)).toEqual({ ok: true })
    expect(checkTitle('あ'.repeat(TITLE_MAX_LENGTH + 1), terms)).toEqual({
      ok: false,
      reason: 'too_long',
      detail: '31'
    })
    expect(checkTitle('😀'.repeat(TITLE_MAX_LENGTH), terms)).toEqual({ ok: true })
  })

  test('括弧類（() （） 【】 「」 [] など）を含むと落ちる', () => {
    for (const bracket of ['(', ')', '（', '）', '【', '】', '「', '」', '『', '[', ']'])
      expect(checkTitle(`夏名刺${bracket}`, terms)).toEqual({ ok: false, reason: 'bracket', detail: bracket })
  })

  test('その店舗のキャラ名・店舗名を含むと落ちる', () => {
    expect(checkTitle('柏たんの夏名刺', terms)).toEqual({ ok: false, reason: 'name', detail: '柏たん' })
    expect(checkTitle('千葉駅前店開店10周年記念名刺', terms)).toEqual({
      ok: false,
      reason: 'name',
      detail: '千葉駅前店'
    })
  })

  test('characters.json に無い「〜たん」も名前と見なす（語の頭から始まるもの）', () => {
    expect(checkTitle('ダンサーハチたん名刺', terms)).toEqual({ ok: false, reason: 'name', detail: 'ダンサーハチたん' })
    expect(checkTitle('ビッカメ娘旅 缶バッジ', terms)).toEqual({ ok: true })
    expect(checkTitle('コラボ ダンサーハチたん', terms)).toEqual({
      ok: false,
      reason: 'name',
      detail: 'ダンサーハチたん'
    })
  })

  test('長さ・括弧・名前の順に判定する（先に当たった理由を返す）', () => {
    expect(checkTitle(`${'あ'.repeat(40)}(柏たん)`, terms).ok).toBe(false)
    const reasons = [
      checkTitle(`${'あ'.repeat(40)}(柏たん)`, terms),
      checkTitle('夏名刺(柏たん)', terms),
      checkTitle('柏たん夏名刺', terms)
    ].map((result) => (result.ok ? 'ok' : result.reason))
    expect(reasons).toEqual(['too_long', 'bracket', 'name'])
  })

  test('説明語（配布・プレゼントなど）は検査しない（規則は指示で伝える）', () => {
    expect(checkTitle('追加配布', terms)).toEqual({ ok: true })
  })
})

describe('isExampleTitle', () => {
  const terms = ['柏たん']

  test('検査に通り、説明語（配布・プレゼント・開始・先行・追加・イベント・デザイン・ver）を含まないものだけ手本にする', () => {
    for (const title of ['バレンタイン名刺', 'ビッカメ娘11周年記念名刺', '缶バッジで繋ぐビッカメ娘旅'])
      expect(isExampleTitle(title, terms)).toBe(true)
    for (const title of [
      '1月限定名刺配布開始',
      'ポストカード先行配布',
      'イベント記念名刺',
      '限定デザイン名刺',
      '新年Ver名刺',
      '店舗誕生25周年記念アクスタ(再配布)',
      '柏たんアクキー'
    ])
      expect(isExampleTitle(title, terms)).toBe(false)
  })
})

describe('normalizeTitle', () => {
  test('NFKC で全角の数字・括弧を揃え、空白をまとめて前後を除く', () => {
    expect(normalizeTitle('  擬人化１０周年　記念アクキー ')).toBe('擬人化10周年 記念アクキー')
    expect(normalizeTitle('夏名刺（柏）')).toBe('夏名刺(柏)')
  })
})

// ---------------------------------------------------------------------------------------------
// 実行（偽の fetch。本物の Haiku は呼ばない）
// ---------------------------------------------------------------------------------------------

const endpoint = { url: 'http://127.0.0.1/unused', token: 't' }

/** 状態の「配布物の名前」の行を取り出す */
const itemOf = (state: string) => /配布物の名前（投稿から読み取ったもの）: (.*)/.exec(state)?.[1]

/** fetch を偽物にして、リクエストの state から題を返す。answer が undefined なら 400（再試行しない失敗） */
const fakeFetch = (answer: (state: string) => string | undefined) => {
  const preconnect = globalThis.fetch.preconnect
  const calls: { system: string; state: string }[] = []
  const spy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        const state: string = body.messages[0].content
        calls.push({ system: body.system, state })
        const title = answer(state)
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
  return { calls, spy }
}

describe('runTitles', () => {
  const targets = ['夏名刺', 'ハロウィン名刺', 'コラボ名刺'].map((item) => buildTitleTarget('SYS', subject({ item })))
  const titles: Record<string, string> = {
    夏名刺: '夏名刺',
    ハロウィン名刺: 'ハロウィン名刺',
    コラボ名刺: 'コラボ名刺'
  }
  const answer = (state: string) => {
    const item = itemOf(state)
    return item === undefined ? undefined : titles[item]
  }

  test('題を得て、リクエストのキーごとに保存する。保存先は seed-title/<モデル>/<バージョン>', async () => {
    const root = await tempDir()
    const cacheDir = join(root, 'seed-title', 'claude-haiku-5-5', TITLE_VERSION)
    const { calls, spy } = fakeFetch(answer)
    try {
      const run = await runTitles({ targets, cacheDir, concurrency: 2, endpoint })
      expect(calls).toHaveLength(3)
      expect(run.progress).toMatchObject({ total: 3, done: 3, cached: 0, called: 3, failed: 0 })
      expect(run.progress.inputTokens).toBe(300)
      expect(run.progress.outputTokens).toBe(30)
      expect(targets.map((target) => run.titles.get(target.key))).toEqual(['夏名刺', 'ハロウィン名刺', 'コラボ名刺'])
      expect(readdirSync(cacheDir).sort()).toEqual(targets.map((target) => `${target.key}.json`).sort())
      expect(await readTitle(cacheDir, targets[0].key)).toBe('夏名刺')
      expect(TITLE_VERSION).toBe('v1')
      // 呼び出しの system と state は、組み立てたリクエストそのまま
      expect(calls[0].system).toBe('SYS')
    } finally {
      spy.mockRestore()
    }
  })

  test('2 回目は保存した題を使い、呼ばない', async () => {
    const root = await tempDir()
    const cacheDir = join(root, 'cache')
    const first = fakeFetch(answer)
    try {
      await runTitles({ targets, cacheDir, concurrency: 2, endpoint })
      expect(first.calls).toHaveLength(3)
    } finally {
      first.spy.mockRestore()
    }
    const second = fakeFetch(() => {
      throw new Error('cached titles must be reused')
    })
    try {
      const run = await runTitles({ targets, cacheDir, concurrency: 2, endpoint })
      expect(second.calls).toHaveLength(0)
      expect(run.progress).toMatchObject({ total: 3, done: 3, cached: 3, called: 0, failed: 0 })
      expect(run.titles.get(targets[1].key)).toBe('ハロウィン名刺')
    } finally {
      second.spy.mockRestore()
    }
  })

  test('1 件の失敗で止まらず、数えて続ける。失敗した分は保存せず、次の実行で呼び直す', async () => {
    const root = await tempDir()
    const cacheDir = join(root, 'cache')
    const errors: string[] = []
    const first = fakeFetch((state) => (itemOf(state) === 'ハロウィン名刺' ? undefined : answer(state)))
    try {
      const run = await runTitles({
        targets,
        cacheDir,
        concurrency: 1,
        endpoint,
        onError: (target, error) => errors.push(`${target.key}:${String(error).slice(0, 3)}`)
      })
      expect(first.calls).toHaveLength(3)
      expect(run.progress).toMatchObject({ total: 3, done: 3, cached: 0, called: 2, failed: 1 })
      expect(run.titles.has(targets[1].key)).toBe(false)
      expect(run.titles.get(targets[0].key)).toBe('夏名刺')
      expect(run.titles.get(targets[2].key)).toBe('コラボ名刺')
      expect(errors).toEqual([`${targets[1].key}:Err`])
      expect(await readTitle(cacheDir, targets[1].key)).toBeUndefined()
    } finally {
      first.spy.mockRestore()
    }
    const second = fakeFetch(answer)
    try {
      const run = await runTitles({ targets, cacheDir, concurrency: 1, endpoint })
      expect(second.calls).toHaveLength(1)
      expect(run.progress).toMatchObject({ cached: 2, called: 1, failed: 0 })
    } finally {
      second.spy.mockRestore()
    }
  })

  test('同じリクエストは 1 件にまとめて 1 回だけ呼ぶ', async () => {
    const root = await tempDir()
    const { calls, spy } = fakeFetch(answer)
    try {
      const run = await runTitles({
        targets: [targets[0], targets[0], targets[1]],
        cacheDir: join(root, 'cache'),
        concurrency: 4,
        endpoint
      })
      expect(calls).toHaveLength(2)
      expect(run.progress.total).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })

  test('壊れた保存ファイルは読み直さず呼び直して上書きする', async () => {
    const root = await tempDir()
    const cacheDir = join(root, 'cache')
    const { spy } = fakeFetch(answer)
    try {
      await runTitles({ targets: [targets[0]], cacheDir, concurrency: 1, endpoint })
      await Bun.write(join(cacheDir, `${targets[0].key}.json`), '{broken')
      expect(await readTitle(cacheDir, targets[0].key)).toBeUndefined()
      const run = await runTitles({ targets: [targets[0]], cacheDir, concurrency: 1, endpoint })
      expect(run.progress).toMatchObject({ called: 1, cached: 0 })
      expect(await readTitle(cacheDir, targets[0].key)).toBe('夏名刺')
    } finally {
      spy.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------------------------
// 選別への組み込み（偽の命名）
// ---------------------------------------------------------------------------------------------

const storeNames = new Map<string, string[]>([
  ['kashiwa', ['柏たん', '柏店']],
  ['kyoto', ['京都たん']]
])
const names = seedNameTerms(storeNames)

/**
 * 最後の言及の既定（now の 9 日前）。終了の情報が無いイベントは、最後の言及が開始日より前だと「終了が分からないまま止まっている」と
 * 見なされて作られないので、フィクスチャは最近まで言及されている（fresh）ことにする。
 */
const RECENT = Date.parse('2026-09-30T00:00:00.000Z')

const seedEvent = (init: Partial<SeedEvent> & { id: string }): SeedEvent => ({
  store: 'kashiwa',
  item: '夏名刺',
  category: 'limited_card',
  startDate: '2026-07-01',
  firstSeen: 1,
  lastSeen: RECENT,
  posts: [{ postId: `${init.id}-1`, status: 'announce' }],
  ...init
})

/** 全投稿のアカウント名を bic_kashiwa にする */
const everyone = async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'bic_kashiwa'] as const))

/** 全投稿の種類を original にする */
const allOriginal = async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'original' as const]))

/** 偽の命名: item ごとに決めた題を返す（無い item は呼び出し失敗） */
const fakeNaming = (answers: Record<string, string>, bodies: Record<string, string> = {}) => {
  const requested: TitleTarget[] = []
  return {
    requested,
    naming: {
      system: 'SYS',
      lookupBodies: async (ids: ReadonlySet<string>) => new Map(Object.entries(bodies).filter(([id]) => ids.has(id))),
      run: async (targets: readonly TitleTarget[]): Promise<TitleRun> => {
        requested.push(...targets)
        const titles = new Map(
          targets.flatMap((target) => {
            const item = itemOf(target.request.state)
            const title = item === undefined ? undefined : answers[item]
            return title === undefined ? [] : [[target.key, title] as const]
          })
        )
        return {
          titles,
          progress: {
            total: targets.length,
            done: targets.length,
            cached: 0,
            called: titles.size,
            failed: targets.length - titles.size,
            stats: { rateLimited: 0, serverErrors: 0, invalid: 0 },
            inputTokens: titles.size * 100,
            outputTokens: titles.size * 10
          }
        }
      }
    }
  }
}

const selectOptions = (events: readonly SeedEvent[], naming?: ReturnType<typeof fakeNaming>['naming']) => ({
  events,
  clef: new Map(events.map((event) => [event.posts[0].postId, 0.9] as const)),
  threshold: 0.7,
  gold: [],
  storeKeys: new Set(['kashiwa', 'kyoto']),
  names,
  storeNames,
  lookupScreenNames: everyone,
  lookupKinds: allOriginal,
  now: '2026-10-09T03:00:00.000Z',
  ...(naming ? { naming } : {})
})

describe('selectSeedEvents（命名）', () => {
  test('命名しない（--titles rule）ときはルールの題が title で、出どころは rule', async () => {
    const selection = await selectSeedEvents(selectOptions([seedEvent({ id: 'a', item: '柏たん夏限定名刺' })]))
    expect(selection.naming).toBeUndefined()
    expect(selection.plans[0]).toMatchObject({
      title: '夏名刺',
      ruleTitle: '夏名刺',
      llmTitle: null,
      titleSource: 'rule',
      titleReject: null
    })
  })

  test('検査に通った Haiku の題を採用する（llm）。ルールの題・Haiku の題を両方残す', async () => {
    const { naming } = fakeNaming({ '2月のアレ（バレンタイン）限定名刺': 'バレンタイン名刺' })
    const selection = await selectSeedEvents(
      selectOptions(
        [seedEvent({ id: 'a', item: '2月のアレ（バレンタイン）限定名刺', startDate: '2026-02-01' })],
        naming
      )
    )
    expect(selection.plans[0]).toMatchObject({
      title: 'バレンタイン名刺',
      ruleTitle: '2月のアレ(バレンタイン)限定名刺',
      llmTitle: 'バレンタイン名刺',
      titleSource: 'llm',
      titleReject: null
    })
    expect(selection.naming).toMatchObject({ requests: 1, called: 1, failed: 0 })
  })

  test('Haiku の題は NFKC・空白を揃えてから検査・採用する', async () => {
    const { naming } = fakeNaming({ 夏名刺: '  擬人化１０周年　記念アクキー ' })
    const selection = await selectSeedEvents(selectOptions([seedEvent({ id: 'a' })], naming))
    expect(selection.plans[0]).toMatchObject({ title: '擬人化10周年 記念アクキー', titleSource: 'llm' })
  })

  test('検査に落ちたらルールの題に戻して fallback にし、理由を残す（括弧・長さ・キャラ名・店舗名・空）', async () => {
    const answers = {
      括弧: '夏名刺(1月1日〜31日配布)',
      長い: 'あ'.repeat(31),
      キャラ名: '柏たん夏名刺',
      店舗名: '柏店夏名刺',
      空: '   '
    }
    const events = Object.keys(answers).map((item, index) =>
      seedEvent({ id: `e${index}`, item, startDate: `2026-07-0${index + 1}` })
    )
    const { naming } = fakeNaming(answers)
    const selection = await selectSeedEvents(selectOptions(events, naming))
    const byItem = new Map(selection.plans.map((plan) => [plan.item, plan]))
    expect(byItem.get('括弧')).toMatchObject({ titleSource: 'fallback', title: '括弧', titleReject: 'bracket(()' })
    expect(byItem.get('長い')).toMatchObject({ titleSource: 'fallback', title: '長い', titleReject: 'too_long(31)' })
    expect(byItem.get('キャラ名')).toMatchObject({ titleSource: 'fallback', titleReject: 'name(柏たん)' })
    expect(byItem.get('店舗名')).toMatchObject({ titleSource: 'fallback', titleReject: 'name(柏店)' })
    expect(byItem.get('空')).toMatchObject({ titleSource: 'fallback', titleReject: 'empty', llmTitle: '' })
    // Haiku の題は採用しない（title はルールの題）
    for (const plan of selection.plans) expect(plan.title).toBe(plan.ruleTitle)
    expect(selection.naming?.fallbacks).toEqual({
      empty: 1,
      too_long: 1,
      bracket: 1,
      name: 2,
      category: 0,
      call_failed: 0
    })
    expect(selection.naming?.rejects).toHaveLength(5)
  })

  test('他の店舗のキャラ名・店舗名も落とす（全店舗の名前を禁止語に使う）', async () => {
    const { naming } = fakeNaming({ 夏名刺: '京都たん夏名刺' })
    const selection = await selectSeedEvents(selectOptions([seedEvent({ id: 'a' })], naming))
    expect(selection.plans[0]).toMatchObject({ titleSource: 'fallback', titleReject: 'name(京都たん)' })
  })

  test('呼び出しが失敗して題が無いときもルールの題に戻し、call_failed として数える', async () => {
    const { naming } = fakeNaming({})
    const selection = await selectSeedEvents(selectOptions([seedEvent({ id: 'a' })], naming))
    expect(selection.plans[0]).toMatchObject({
      title: '夏名刺',
      llmTitle: null,
      titleSource: 'fallback',
      titleReject: 'call_failed'
    })
    expect(selection.naming).toMatchObject({ requests: 1, called: 0, failed: 1 })
    expect(selection.naming?.fallbacks.call_failed).toBe(1)
  })

  describe('D1 の同名の企画との配布物の種別（category）', () => {
    const d1Titles = [
      { title: '缶バッジで繋ぐビッカメ娘旅', category: 'other' },
      { title: '缶バッジで繋ぐビッカメ娘旅', category: 'other' },
      { title: 'コラボ名刺', category: 'limited_card' },
      { title: 'コラボ名刺', category: 'ackey' },
      { title: 'ビッ旅 プチトレイントリップ', category: 'other' }
    ]

    const run = async (event: Partial<SeedEvent>, answer: string, d1: typeof d1Titles | null = d1Titles) => {
      const item = 'ビッ旅 名刺'
      const { naming } = fakeNaming({ [item]: answer })
      return selectSeedEvents({
        ...selectOptions([seedEvent({ id: 'a', item, ...event })], naming),
        ...(d1 === null ? {} : { d1Titles: d1 })
      })
    }

    test('D1 の同名の企画と種別が違えば、Haiku の題を採用せずルールの題に戻す（日本語の間の空白は詰める）', async () => {
      const selection = await run({ category: 'limited_card' }, '缶バッジで繋ぐビッカメ娘旅')
      expect(selection.plans[0]).toMatchObject({
        title: 'ビッ旅名刺',
        ruleTitle: 'ビッ旅 名刺',
        llmTitle: '缶バッジで繋ぐビッカメ娘旅',
        titleSource: 'fallback',
        titleReject: 'category(D1=other 今回=limited_card)'
      })
      expect(selection.naming?.fallbacks).toMatchObject({ category: 1, call_failed: 0 })
      expect(selection.naming?.rejects).toEqual([
        {
          store: 'kashiwa',
          startDay: '2026-07-01',
          item: 'ビッ旅 名刺',
          llmTitle: '缶バッジで繋ぐビッカメ娘旅',
          ruleTitle: 'ビッ旅 名刺',
          title: 'ビッ旅名刺',
          reason: 'category',
          reject: 'category(D1=other 今回=limited_card)',
          gate: null
        }
      ])
    })

    test('D1 の同名の企画と種別が合えば、Haiku の題を採用する', async () => {
      const selection = await run({ category: 'other' }, '缶バッジで繋ぐビッカメ娘旅')
      expect(selection.plans[0]).toMatchObject({
        title: '缶バッジで繋ぐビッカメ娘旅',
        titleSource: 'llm',
        titleReject: null
      })
      expect(selection.naming?.fallbacks.category).toBe(0)
    })

    test('D1 に無い題はこの検査の対象外（種別が何でも採用する）', async () => {
      const selection = await run({ category: 'limited_card' }, 'ビッ旅名刺')
      expect(selection.plans[0]).toMatchObject({ title: 'ビッ旅名刺', titleSource: 'llm' })
    })

    test('D1 で複数の種別を持つ題は、どれかに合えば採用する。どれにも合わなければ戻す', async () => {
      const limited = await run({ category: 'limited_card' }, 'コラボ名刺')
      const ackey = await run({ category: 'ackey' }, 'コラボ名刺')
      const regular = await run({ category: 'regular_card' }, 'コラボ名刺')
      expect(limited.plans[0]).toMatchObject({ title: 'コラボ名刺', titleSource: 'llm' })
      expect(ackey.plans[0]).toMatchObject({ title: 'コラボ名刺', titleSource: 'llm' })
      expect(regular.plans[0]).toMatchObject({
        title: 'ビッ旅名刺',
        titleSource: 'fallback',
        titleReject: 'category(D1=limited_card/ackey 今回=regular_card)'
      })
    })

    test('D1 のタイトルとの一致は NFKC・空白除去の後で比べる（D1 の題に空白があっても、同じ題なら対象）', async () => {
      const plain = await run({ category: 'limited_card' }, 'ビッ旅プチトレイントリップ')
      expect(plain.plans[0]).toMatchObject({
        titleSource: 'fallback',
        titleReject: 'category(D1=other 今回=limited_card)'
      })
      const wide = await run({ category: 'limited_card' }, 'ビッ旅 プチトレイン　トリップ')
      expect(wide.plans[0]).toMatchObject({ titleSource: 'fallback' })
    })

    test('d1Titles を渡さなければこの検査はしない', async () => {
      const selection = await run({ category: 'limited_card' }, '缶バッジで繋ぐビッカメ娘旅', null)
      expect(selection.plans[0]).toMatchObject({ title: '缶バッジで繋ぐビッカメ娘旅', titleSource: 'llm' })
    })

    test('先に当たった検査の理由を残す（キャラ名は category より先）', async () => {
      const selection = await run({ category: 'limited_card' }, '柏たんコラボ名刺', [
        { title: '柏たんコラボ名刺', category: 'ackey' }
      ])
      expect(selection.plans[0]).toMatchObject({ titleReject: 'name(柏たん)' })
    })
  })

  describe('ルールの題に戻した題の品質ゲート', () => {
    const noAnswer = () => fakeNaming({}).naming

    test('括弧類が残る題・説明語が残る題・汎用名「グッズ」は作らない。段階表と untitled に残る', async () => {
      const events = [
        seedEvent({ id: 'bracket', item: '夏名刺（臨時）', startDate: '2026-07-01' }),
        seedEvent({ id: 'descriptive', item: '夏名刺プレゼント', startDate: '2026-07-02' }),
        seedEvent({ id: 'generic', item: '柏たんグッズ', category: 'other', startDate: '2026-07-03' }),
        seedEvent({ id: 'ok', item: '夏の名刺', startDate: '2026-07-04' })
      ]
      const selection = await selectSeedEvents(selectOptions(events, noAnswer()))
      expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['ok'])
      expect(selection.untitled).toEqual([
        {
          emulatedId: 'bracket',
          store: 'kashiwa',
          startDay: '2026-07-01',
          item: '夏名刺（臨時）',
          ruleTitle: '夏名刺(臨時)',
          llmTitle: null,
          reason: 'bracket(()'
        },
        {
          emulatedId: 'descriptive',
          store: 'kashiwa',
          startDay: '2026-07-02',
          item: '夏名刺プレゼント',
          ruleTitle: '夏名刺プレゼント',
          llmTitle: null,
          reason: 'descriptive(プレゼント)'
        },
        {
          emulatedId: 'generic',
          store: 'kashiwa',
          startDay: '2026-07-03',
          item: '柏たんグッズ',
          ruleTitle: 'グッズ',
          llmTitle: null,
          reason: 'generic(グッズ)'
        }
      ])
      const labels = selection.stages.map((stage) => stage.label)
      const index = labels.findIndex((label) => label.startsWith('題を付けられる'))
      expect(index).toBeGreaterThan(0)
      expect(labels[index + 1]).toContain('同じ店舗・開始日・題')
      expect(selection.stages[index]).toMatchObject({ excluded: 3, remaining: 1 })
      // 重複をまとめる段階の入力は、ゲートを通った件数
      expect(selection.stages[index + 1]).toMatchObject({ excluded: 0, remaining: 1 })
    })

    test('Haiku の題を採用したイベントにはかけない（checkTitle は通っている）。汎用名でも説明語つきでも残す', async () => {
      const { naming } = fakeNaming({ 柏たんグッズ: 'グッズ', 夏の名刺: '配布開始記念名刺' })
      const selection = await selectSeedEvents(
        selectOptions(
          [
            seedEvent({ id: 'generic', item: '柏たんグッズ', category: 'other', startDate: '2026-07-01' }),
            seedEvent({ id: 'descriptive', item: '夏の名刺', startDate: '2026-07-02' })
          ],
          naming
        )
      )
      expect(selection.untitled).toEqual([])
      expect(selection.plans.map((plan) => [plan.title, plan.titleSource]).sort()).toEqual([
        ['グッズ', 'llm'],
        ['配布開始記念名刺', 'llm']
      ])
    })

    test('D1 に実在する既定名（限定名刺・通常名刺・アクキー）は残す', async () => {
      const events = [
        seedEvent({ id: 'limited', item: '柏たん', category: 'limited_card', startDate: '2026-07-01' }),
        seedEvent({ id: 'regular', item: '柏店', category: 'regular_card', startDate: '2026-07-02' }),
        seedEvent({ id: 'ackey', item: '柏たん', category: 'ackey', startDate: '2026-07-03' })
      ]
      const selection = await selectSeedEvents(selectOptions(events, noAnswer()))
      expect(selection.untitled).toEqual([])
      expect(selection.plans.map((plan) => [plan.emulatedId, plan.title, plan.titleSource]).sort()).toEqual([
        ['ackey', 'アクキー', 'fallback'],
        ['limited', '限定名刺', 'fallback'],
        ['regular', '通常名刺', 'fallback']
      ])
    })

    test('--titles rule はゲートをかけない（命名しない下書きの題。段階の行は出るが除外は 0）', async () => {
      const events = [
        seedEvent({ id: 'bracket', item: '夏名刺（臨時）', startDate: '2026-07-01' }),
        seedEvent({ id: 'generic', item: '柏たんグッズ', category: 'other', startDate: '2026-07-02' })
      ]
      const selection = await selectSeedEvents(selectOptions(events))
      expect(selection.untitled).toEqual([])
      expect(selection.plans.map((plan) => plan.title).sort()).toEqual(['グッズ', '夏名刺(臨時)'])
      expect(selection.stages.find((stage) => stage.label.startsWith('題を付けられる'))).toMatchObject({
        excluded: 0,
        remaining: 2
      })
    })

    test('グッズが外れれば、同じ題の名刺との誤マージも起きない（D1 の種別違いで戻した「コラボ名刺」）', async () => {
      const events = [
        seedEvent({
          id: 'card',
          store: 'kyoto',
          item: 'コラボ限定名刺',
          posts: [
            { postId: 'card-1', status: 'announce' },
            { postId: 'card-2', status: 'start' }
          ]
        }),
        seedEvent({ id: 'goods', store: 'kyoto', item: '京都たんグッズ', category: 'other', firstSeen: 2 })
      ]
      const { naming } = fakeNaming({ コラボ限定名刺: 'コラボ名刺', 京都たんグッズ: 'コラボ名刺' })
      const selection = await selectSeedEvents({
        ...selectOptions(events, naming),
        d1Titles: [
          { title: 'コラボ名刺', category: 'limited_card' },
          { title: 'コラボ名刺', category: 'ackey' }
        ]
      })
      expect(selection.plans.map((plan) => [plan.emulatedId, plan.title])).toEqual([['card', 'コラボ名刺']])
      expect(selection.untitled).toMatchObject([
        { emulatedId: 'goods', ruleTitle: 'グッズ', llmTitle: 'コラボ名刺', reason: 'generic(グッズ)' }
      ])
      // 以前は「グッズ」が「コラボ名刺」として重複に数えられていた。今は重複に数えない
      expect(selection.duplicates.dropped).toBe(0)
      expect(selection.naming?.fallbacks.category).toBe(1)
      expect(selection.naming?.rejects[0]).toMatchObject({ reason: 'category', gate: 'generic(グッズ)' })
    })
  })

  test('命名の入力: その店舗のキャラ名・店舗名が禁止語、告知・開始の本文が入る', async () => {
    const { naming, requested } = fakeNaming(
      { 夏名刺: '夏名刺' },
      { 'a-1': '夏の名刺を配布します', 'a-2': '本日から配布開始です', 'a-3': '三つ目の投稿' }
    )
    await selectSeedEvents(
      selectOptions(
        [
          seedEvent({
            id: 'a',
            posts: [
              { postId: 'a-1', status: 'announce' },
              { postId: 'a-2', status: 'start' },
              { postId: 'a-3', status: 'ongoing' }
            ]
          })
        ],
        naming
      )
    )
    expect(requested).toHaveLength(1)
    const { request } = requested[0]
    expect(request.system).toBe('SYS')
    expect(request.state).toContain('入れてはいけない語（この店舗のキャラ名・店舗名）: 柏たん、柏店')
    expect(request.state).toContain('投稿本文（告知）:\n夏の名刺を配布します')
    expect(request.state).toContain('投稿本文（開始）:\n本日から配布開始です')
    expect(request.state).not.toContain('三つ目の投稿')
    expect(request.state).toContain('開始日: 2026-07-01（7月）')
  })

  test('重複の判定は採用したタイトルで行う（ルールの題が違っても、同じ題になれば 1 件にまとめる）', async () => {
    const events = [
      seedEvent({ id: 'few', item: '例のアレ', posts: [{ postId: 'few-1', status: 'announce' }] }),
      seedEvent({
        id: 'most',
        item: '2月のアレ',
        posts: [
          { postId: 'most-1', status: 'announce' },
          { postId: 'most-2', status: 'start' }
        ]
      }),
      // 採用した題が違うものは別のイベント
      seedEvent({ id: 'other', item: '別のアレ' })
    ]
    const { naming } = fakeNaming({
      例のアレ: 'バレンタイン名刺',
      '2月のアレ': 'バレンタイン名刺',
      別のアレ: 'コラボ名刺'
    })
    const selection = await selectSeedEvents(selectOptions(events, naming))
    expect(selection.plans.map((plan) => plan.emulatedId).sort()).toEqual(['most', 'other'])
    expect(selection.duplicates).toEqual({
      dropped: 1,
      examples: [{ store: 'kashiwa', startDay: '2026-07-01', title: 'バレンタイン名刺', kept: 'most' }]
    })
    // ルールの題（夏名刺）が同じでも、採用した題が違えば別のイベント（--titles rule なら 1 件にまとまる）
    const sameRule = [seedEvent({ id: 'x', item: 'X' }), seedEvent({ id: 'y', item: 'Y', firstSeen: 2 })]
    const split = await selectSeedEvents(
      selectOptions(sameRule, fakeNaming({ X: 'ハロウィン名刺', Y: 'バレンタイン名刺' }).naming)
    )
    expect(split.plans.map((plan) => plan.title).sort()).toEqual(['ハロウィン名刺', 'バレンタイン名刺'])
    expect(split.duplicates.dropped).toBe(0)
  })

  test('命名は選別の後（重複を除く前・--limit の前）の全イベントに対して行う', async () => {
    const events = [
      seedEvent({ id: 'a', startDate: '2026-05-01', item: '春名刺' }),
      seedEvent({ id: 'b', startDate: '2026-09-01', item: '秋名刺' }),
      seedEvent({ id: 'c', startDate: '2026-07-01', item: '夏名刺' }),
      // 選別で落ちるもの（Clef の判定が無い）は命名しない
      seedEvent({ id: 'unjudged', item: '落ちる名刺', startDate: '2026-07-02' })
    ]
    const { naming, requested } = fakeNaming({ 春名刺: '春名刺', 秋名刺: '秋名刺', 夏名刺: '夏名刺' })
    const options = selectOptions(events, naming)
    const selection = await selectSeedEvents({
      ...options,
      clef: new Map(['a-1', 'b-1', 'c-1'].map((id) => [id, 0.9] as const)),
      limit: 1
    })
    expect(requested).toHaveLength(3)
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['b'])
    expect(selection.naming?.requests).toBe(3)
  })

  test('stages に命名の段階を足さない（段階の並びは rule と同じ）', async () => {
    const events = [seedEvent({ id: 'a' })]
    const rule = await selectSeedEvents(selectOptions(events))
    const llm = await selectSeedEvents(selectOptions(events, fakeNaming({ 夏名刺: '夏名刺' }).naming))
    expect(llm.stages).toEqual(rule.stages)
  })
})

describe('MIN_LIMITED_QUANTITY', () => {
  const quantities = (values: readonly (number | undefined)[]) =>
    values.map((quantity, index) =>
      seedEvent({
        id: `q${index}`,
        startDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
        ...(quantity === undefined ? {} : { quantity })
      })
    )

  test('10 未満は limitedQuantity に使わない（9 は捨て、10 は使う）。捨てた件数と内訳を数える', async () => {
    expect(MIN_LIMITED_QUANTITY).toBe(10)
    const selection = await selectSeedEvents(selectOptions(quantities([1, 1, 9, 10, 30, undefined])))
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan.limitedQuantity]))
    expect(byId).toEqual(
      new Map([
        ['q0', null],
        ['q1', null],
        ['q2', null],
        ['q3', 10],
        ['q4', 30],
        ['q5', null]
      ])
    )
    expect(selection.discardedQuantities).toMatchObject({
      count: 3,
      byQuantity: [
        { quantity: 1, count: 2 },
        { quantity: 9, count: 1 }
      ]
    })
    expect(selection.discardedQuantities.examples).toHaveLength(3)
    // 作成予定は開始日の新しい順
    expect(selection.discardedQuantities.examples[0]).toEqual({
      emulatedId: 'q2',
      startDay: '2026-07-03',
      title: '夏名刺',
      quantity: 9
    })
  })

  test('捨てたのは最終的な作成予定のイベントだけ（--limit で外れたものは数えない）', async () => {
    const selection = await selectSeedEvents({ ...selectOptions(quantities([1, 1, 1, 50])), limit: 1 })
    expect(selection.plans.map((plan) => plan.emulatedId)).toEqual(['q3'])
    expect(selection.discardedQuantities.count).toBe(0)
  })
})

describe('squeezeJapaneseSpaces', () => {
  test('日本語どうしの間の半角空白を詰める（かな・カタカナ・漢字・長音）', () => {
    expect(squeezeJapaneseSpaces('ビッ旅 名刺')).toBe('ビッ旅名刺')
    expect(squeezeJapaneseSpaces('ビッ旅  神奈川地区 名刺')).toBe('ビッ旅神奈川地区名刺')
    expect(squeezeJapaneseSpaces('お正月 ばんざい ノート')).toBe('お正月ばんざいノート')
    expect(squeezeJapaneseSpaces('ルー プ')).toBe('ループ')
  })

  test('英数字に接する空白は残す', () => {
    expect(squeezeJapaneseSpaces('Summer Card')).toBe('Summer Card')
    expect(squeezeJapaneseSpaces('10 周年 記念')).toBe('10 周年記念')
    expect(squeezeJapaneseSpaces('夏 Special 名刺')).toBe('夏 Special 名刺')
    expect(squeezeJapaneseSpaces('ビッカメ娘 2周年')).toBe('ビッカメ娘 2周年')
  })

  test('空白が無い題・空の題はそのまま', () => {
    expect(squeezeJapaneseSpaces('夏名刺')).toBe('夏名刺')
    expect(squeezeJapaneseSpaces('')).toBe('')
  })
})
