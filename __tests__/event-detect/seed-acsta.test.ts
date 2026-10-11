import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DetectPost } from '@biccame/shared/event-detect/post'
import { GapCategorySchema } from '@biccame/shared/event-detect/viewer'
import { analyze } from '../../scripts/lib/event-detect/analysis'
import { type Decision, scoreModel } from '../../scripts/lib/event-detect/evaluate'
import type { GoldEvent } from '../../scripts/lib/event-detect/gold'
import {
  type AcstaVerdict,
  categoryOf,
  DEFAULT_TITLES,
  explainTitle,
  judgeAcsta,
  type SeedEvent,
  selectSeedEvents
} from '../../scripts/lib/event-detect/seed'
import {
  applyFix,
  buildAcstaProductionSql,
  countChanges,
  describeFix,
  planAcsta,
  runFix,
  summarizeFix
} from '../../scripts/lib/event-detect/seed-fix'
import {
  buildTitleTarget,
  type TitleRun,
  type TitleTarget,
  titleExamples,
  titleSystem
} from '../../scripts/lib/event-detect/seed-title'
import {
  at,
  categoryOfRow,
  dump,
  makeWorld,
  NOW,
  removeAll,
  rowsOf,
  tempRoot,
  type WorldEvent
} from '../fixtures/fix-world'

// カテゴリ「アクスタ」（acsta）: 抽出と Clef の質問にはアクスタの選択肢が無い（変えると判定のキャッシュが使えなくなる）ので、
// 題（NFKC 後）が アクスタ / アクリルスタンド を含み、アクキー / キーホルダーを含まない other を acsta にする。

const directories: string[] = []
afterEach(() => removeAll(directories))

describe('judgeAcsta / categoryOf（純粋関数）', () => {
  const cases: [string, string, AcstaVerdict][] = [
    // アクスタ・アクリルスタンド（other）は付け替える
    ['アクスタ', 'other', 'convert'],
    ['アクリルスタンド', 'other', 'convert'],
    ['机バンバンアクスタセット', 'other', 'convert'],
    ['20周年記念アクリルスタンド', 'other', 'convert'],
    // NFKC: 半角カナ・全角の揺れを揃えて判定する
    ['ｱｸｽﾀ', 'other', 'convert'],
    ['アクリルｽﾀﾝﾄﾞ', 'other', 'convert'],
    ['１０周年アクスタ', 'other', 'convert'],
    // アクキー・キーホルダーと一緒の題は付け替えない
    ['アクスタ+アクキーセット', 'other', 'keep_ackey'],
    ['アクスタ＋アクキーセット', 'other', 'keep_ackey'],
    ['アクリルスタンドとキーホルダー', 'other', 'keep_ackey'],
    ['ｱｸｽﾀ+ｱｸｷｰ', 'other', 'keep_ackey'],
    // other 以外は付け替えない（一覧には出す）
    ['アクスタ', 'ackey', 'keep_category'],
    ['アクスタ', 'limited_card', 'keep_category'],
    ['アクスタ', 'regular_card', 'keep_category'],
    // 既に acsta は対象外
    ['アクスタ', 'acsta', 'none'],
    // 題がアクスタではない
    ['アクキー', 'other', 'none'],
    ['缶バッジ', 'other', 'none'],
    ['夏名刺', 'limited_card', 'none']
  ]

  test.each(cases)('題=%s category=%s → %s', (title, category, expected) => {
    expect(judgeAcsta(title, category)).toBe(expected)
  })

  test('categoryOf: convert のときだけ acsta にし、それ以外は元のカテゴリのまま', () => {
    expect(categoryOf('机バンバンアクスタ', 'other')).toBe('acsta')
    expect(categoryOf('アクスタ+アクキーセット', 'other')).toBe('other')
    expect(categoryOf('アクスタ', 'ackey')).toBe('ackey')
    expect(categoryOf('アクスタ', 'limited_card')).toBe('limited_card')
    expect(categoryOf('缶バッジ', 'other')).toBe('other')
  })
})

describe('GapCategorySchema の acsta', () => {
  test('acsta を含み、アプリの EventCategorySchema と同じ 5 つ', async () => {
    expect(GapCategorySchema.options).toEqual(['limited_card', 'regular_card', 'ackey', 'acsta', 'other'])
    const source = await readFile(join(import.meta.dir, '../../workers/app/src/schemas/event.dto.ts'), 'utf8')
    const match = /EventCategorySchema = z\.enum\(\[([^\]]+)\]/.exec(source)
    if (match === null) throw new Error('EventCategorySchema not found')
    const app = [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
    expect([...GapCategorySchema.options].map(String).sort()).toEqual([...app].sort())
  })

  test('DEFAULT_TITLES.acsta は D1（gold.json）で多い表記（アクリルスタンド）', () => {
    expect(DEFAULT_TITLES.acsta).toBe('アクリルスタンド')
    expect(explainTitle('柏たん', 'acsta', '2026-07-01', ['柏たん']).title).toBe('アクリルスタンド')
  })

  test('Clef の選択肢に acsta は無いので、D1 の acsta は other に対応させる（評価）', () => {
    const post: DetectPost = {
      id: '1',
      createdAt: '2026-06-01T01:00:00.000Z',
      screenName: 'bic_example',
      kind: 'original',
      text: 'アクスタ配布中',
      url: 'https://x.com/bic_example/status/1',
      media: []
    }
    const goldEvent: GoldEvent = {
      uuid: '00000000-0000-4000-8000-000000000001',
      title: 'アクスタ',
      category: 'acsta',
      stores: ['example'],
      startDate: '2026-06-01T00:00:00.000Z',
      conditions: [],
      isPreliminary: false,
      referenceUrls: [{ type: 'announce', url: post.url }]
    }
    const analysis = analyze({
      posts: [post],
      events: [goldEvent],
      accounts: [{ storeId: 'example', name: '例たん', screenName: 'bic_example' }],
      characterNames: ['例たん']
    })
    const decision = (choice: string): Decision => ({
      postId: '1',
      model: 'clef',
      kind: 'gold',
      request: { state: 'x', questions: {} },
      response: { answers: { category: { type: 'choice', choice, probabilities: {} } } },
      endedCandidates: {},
      elapsedMs: 1
    })
    // acsta の正解に対して Clef が other と答えれば正解。ackey と答えれば不正解
    expect(scoreModel('clef', [decision('other')], analysis).category).toEqual({ correct: 1, total: 1 })
    expect(scoreModel('clef', [decision('ackey')], analysis).category).toEqual({ correct: 0, total: 1 })
  })
})

describe('命名のプロンプトは acsta を足しても変わらない（変わると保存済みの題が全部使えなくなる）', () => {
  const gold = [
    { title: '夏名刺', category: 'limited_card' },
    { title: '通常名刺', category: 'regular_card' },
    { title: '擬人化10周年アクキー', category: 'ackey' },
    { title: 'アクリルスタンド', category: 'other' },
    { title: '缶バッジ', category: 'other' }
  ]

  test('手本は 4 つのカテゴリのままで、acsta のキーを持たない。システムの指示にも acsta は出ない', () => {
    const examples = titleExamples(gold, () => true)
    expect(Object.keys(examples.byCategory).sort()).toEqual(['ackey', 'limited_card', 'other', 'regular_card'])
    const system = titleSystem(examples)
    expect(system).not.toContain('acsta')
    expect(system).toContain('- other（')
    // acsta の題は other のカテゴリに載ったまま（アクスタは other の基準に入っている）
    expect(examples.byCategory.other).toContain('アクリルスタンド')
  })

  test('acsta の題を作るイベントも、命名には other で渡す（リクエストのキーが other のときと同じ）', async () => {
    const requested: TitleTarget[] = []
    const naming = {
      system: titleSystem(titleExamples(gold, () => true)),
      lookupBodies: async () => new Map<string, string>(),
      run: async (targets: readonly TitleTarget[]): Promise<TitleRun> => {
        requested.push(...targets)
        return {
          titles: new Map(targets.map((target) => [target.key, '机バンバンアクスタ'] as const)),
          progress: {
            total: targets.length,
            done: targets.length,
            cached: 0,
            called: targets.length,
            failed: 0,
            stats: { rateLimited: 0, serverErrors: 0, invalid: 0 },
            inputTokens: 1,
            outputTokens: 1
          }
        }
      }
    }
    const event: SeedEvent = {
      id: 'a',
      store: 'kashiwa',
      item: '机バンバンアクスタ',
      category: 'other',
      startDate: '2026-07-01',
      firstSeen: 1,
      lastSeen: at('2026-09-30T00:00:00.000Z'),
      posts: [{ postId: 'a-1', status: 'announce' }]
    }
    const selection = await selectSeedEvents({
      events: [event],
      clef: new Map([['a-1', 0.9]]),
      threshold: 0.7,
      gold: [],
      storeKeys: new Set(['kashiwa']),
      names: [],
      lookupScreenNames: async (ids) => new Map([...ids].map((id) => [id, 'bic_kashiwa'] as const)),
      lookupKinds: async (ids) => new Map([...ids].map((id) => [id, 'original' as const])),
      naming,
      now: NOW
    })
    expect(selection.plans[0]).toMatchObject({ title: '机バンバンアクスタ', category: 'acsta' })
    // 命名のキーは「other で聞いた」ときのものと一致する
    const same = buildTitleTarget(naming.system, {
      item: '机バンバンアクスタ',
      category: 'other',
      startDay: '2026-07-01',
      forbidden: [],
      bodies: []
    })
    expect(requested.map((target) => target.key)).toEqual([same.key])
  })
})

// ---------------------------------------------------------------------------------------------
// seed の新規作成
// ---------------------------------------------------------------------------------------------

const seedEvent = (init: Partial<SeedEvent> & { id: string }): SeedEvent => ({
  store: 'kashiwa',
  item: '夏名刺',
  category: 'limited_card',
  startDate: '2026-07-01',
  firstSeen: 1,
  lastSeen: at('2026-09-30T00:00:00.000Z'),
  posts: [{ postId: `${init.id}-1`, status: 'announce' }],
  ...init
})

const baseOptions = (list: readonly SeedEvent[]) => ({
  events: list,
  clef: new Map(list.map((event) => [event.posts[0].postId, 0.9] as const)),
  threshold: 0.7,
  gold: [],
  storeKeys: new Set(['kashiwa']),
  names: [],
  lookupScreenNames: async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'bic_kashiwa'] as const)),
  lookupKinds: async (ids: ReadonlySet<string>) => new Map([...ids].map((id) => [id, 'original' as const])),
  now: NOW
})

describe('seed の新規作成のカテゴリ', () => {
  test('LLM の category が other で採用した題がアクスタなら acsta。アクキーと一緒・ackey・名刺は変えず、報告する', async () => {
    const list = [
      seedEvent({ id: 'a', item: '机バンバンアクスタ', category: 'other', startDate: '2026-07-01' }),
      seedEvent({ id: 'b', item: 'アクリルスタンド', category: 'other', startDate: '2026-07-02' }),
      seedEvent({ id: 'c', item: 'アクスタ＋アクキーセット', category: 'other', startDate: '2026-07-03' }),
      seedEvent({ id: 'd', item: 'アクスタ', category: 'ackey', startDate: '2026-07-04' }),
      seedEvent({ id: 'e', item: 'アクスタ名刺', category: 'limited_card', startDate: '2026-07-05' }),
      seedEvent({ id: 'f', item: '缶バッジ', category: 'other', startDate: '2026-07-06' })
    ]
    const selection = await selectSeedEvents(baseOptions(list))
    const byId = new Map(selection.plans.map((plan) => [plan.emulatedId, plan]))
    expect(byId.get('a')).toMatchObject({ title: '机バンバンアクスタ', category: 'acsta' })
    expect(byId.get('b')).toMatchObject({ title: 'アクリルスタンド', category: 'acsta' })
    expect(byId.get('c')).toMatchObject({ title: 'アクスタ+アクキーセット', category: 'other' })
    expect(byId.get('d')).toMatchObject({ category: 'ackey' })
    expect(byId.get('e')).toMatchObject({ category: 'limited_card' })
    expect(byId.get('f')).toMatchObject({ category: 'other' })
  })

  test('D1 の同名の題との種別チェックでは acsta と other を一致とみなす（D1 はまだ other のまま）', async () => {
    const d1Titles = [{ title: '机バンバンアクスタ', category: 'other' }]
    const item = '机バンバンアクスタ'
    const run = async (category: SeedEvent['category']) => {
      const naming = {
        system: 'SYS',
        lookupBodies: async () => new Map<string, string>(),
        run: async (targets: readonly TitleTarget[]): Promise<TitleRun> => ({
          titles: new Map(targets.map((target) => [target.key, item] as const)),
          progress: {
            total: targets.length,
            done: targets.length,
            cached: 0,
            called: targets.length,
            failed: 0,
            stats: { rateLimited: 0, serverErrors: 0, invalid: 0 },
            inputTokens: 1,
            outputTokens: 1
          }
        })
      }
      return selectSeedEvents({
        ...baseOptions([seedEvent({ id: 'a', item, category })]),
        d1Titles,
        naming
      })
    }
    // LLM の category は other → 題がアクスタなので acsta になるが、D1 の other と一致するので題を採用する
    const accepted = await run('other')
    expect(accepted.plans[0]).toMatchObject({ title: item, titleSource: 'llm', category: 'acsta' })
    expect(accepted.naming?.fallbacks.category).toBe(0)
    // D1 に acsta が入っても、LLM の other と一致する（acsta と other は同じ）
    const sameAsAcsta = await selectSeedEvents({
      ...baseOptions([seedEvent({ id: 'a', item, category: 'other' })]),
      d1Titles: [{ title: item, category: 'acsta' }],
      naming: {
        system: 'SYS',
        lookupBodies: async () => new Map<string, string>(),
        run: async (targets: readonly TitleTarget[]): Promise<TitleRun> => ({
          titles: new Map(targets.map((target) => [target.key, item] as const)),
          progress: {
            total: targets.length,
            done: targets.length,
            cached: 0,
            called: targets.length,
            failed: 0,
            stats: { rateLimited: 0, serverErrors: 0, invalid: 0 },
            inputTokens: 1,
            outputTokens: 1
          }
        })
      }
    })
    expect(sameAsAcsta.plans[0]).toMatchObject({ titleSource: 'llm' })
    // D1 の同名が名刺なら、これまでどおり種別が違うので採用しない
    const rejected = await selectSeedEvents({
      ...baseOptions([seedEvent({ id: 'a', item, category: 'other' })]),
      d1Titles: [{ title: item, category: 'limited_card' }],
      naming: {
        system: 'SYS',
        lookupBodies: async () => new Map<string, string>(),
        run: async (targets: readonly TitleTarget[]): Promise<TitleRun> => ({
          titles: new Map(targets.map((target) => [target.key, item] as const)),
          progress: {
            total: targets.length,
            done: targets.length,
            cached: 0,
            called: targets.length,
            failed: 0,
            stats: { rateLimited: 0, serverErrors: 0, invalid: 0 },
            inputTokens: 1,
            outputTokens: 1
          }
        })
      }
    })
    expect(rejected.plans[0]).toMatchObject({ titleSource: 'fallback' })
    expect(rejected.naming?.fallbacks.category).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------
// seed --fix
// ---------------------------------------------------------------------------------------------

/** 記念日の基準（開始が 30 日以内で、削除の対象にならない）。lastSeen は最近 */
const RECENT_START = '2026-09-25'

const events: WorldEvent[] = [
  // 自動作成の other でアクスタ → 付け替え
  { id: 'a-auto', title: '机バンバンアクスタ', category: 'other', startDay: RECENT_START },
  { id: 'a-auto2', title: 'アクリルスタンド', category: 'other', startDay: '2026-09-26' },
  // 確認済みの other でアクスタ → 付け替え（確認済みも対象）
  { id: 'a-verified', title: '20周年記念アクリルスタンド', category: 'other', startDay: '2026-04-01', verified: true },
  // 手で作った is_verified=0（レポートに無い）の other でアクスタ → 付け替え（題で決まるので対応は要らない）
  { id: 'a-manual', title: 'GWアクスタA', category: 'other', startDay: '2026-04-28', auto: false },
  // アクキーと一緒の題 → 変えずに一覧で報告
  { id: 'k-ackey', title: 'アクスタ+アクキーセット', category: 'other', startDay: '2026-09-27' },
  // ackey / limited_card のアクスタ → 変えずに一覧で報告
  { id: 'k-cat', title: 'アクスタ', category: 'ackey', startDay: '2026-09-28' },
  { id: 'k-card', title: 'アクスタ名刺', category: 'limited_card', startDay: '2026-09-29', verified: true },
  // 既に acsta → 対象外（一覧にも出さない）
  { id: 'done', title: '集合アクスタ', category: 'acsta', startDay: '2026-09-30' },
  // アクスタではない other
  { id: 'badge', title: '缶バッジ', category: 'other', startDay: '2026-09-24' },
  // アクスタだが削除するイベント（終了が分からないまま止まっている）→ 付け替えない・一覧にも出さない
  {
    id: 'a-gone',
    title: '消えるアクスタ',
    category: 'other',
    startDay: '2026-07-01',
    lastSeen: '2026-01-01T00:00:00.000Z'
  }
]

const acstaIds = ['a-auto', 'a-auto2', 'a-verified', 'a-manual']

describe('seed --fix: category=other のアクスタを acsta に付け替える', () => {
  test('dry-run: 確認済み・手作りも付け替える対象。アクキー併記・ackey・名刺は付け替えず一覧で報告し、削除するイベントは両方から除く', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const before = dump(world.db)
    world.db.close()
    const options = world.options()
    const run = await runFix(options)
    expect(run.plan.recategorize.map((row) => row.id).sort()).toEqual([...acstaIds].sort())
    expect(run.plan.recategorize.find((row) => row.id === 'a-verified')).toMatchObject({ isVerified: true })
    expect(run.plan.recategorize.find((row) => row.id === 'a-manual')).toMatchObject({ isVerified: false })
    expect(run.plan.acstaKept.map((row) => [row.id, row.verdict]).sort()).toEqual([
      ['k-ackey', 'keep_ackey'],
      ['k-card', 'keep_category'],
      ['k-cat', 'keep_category']
    ])
    // 削除するイベントは付け替えない・一覧にも出さない
    expect(run.plan.events.find((event) => event.eventId === 'a-gone')?.outcome).toBe('delete')
    expect(run.plan.recategorize.some((row) => row.id === 'a-gone')).toBe(false)
    expect(run.plan.acstaKept.some((row) => row.id === 'a-gone')).toBe(false)
    expect(summarizeFix(run.plan).acsta).toEqual({
      recategorize: { total: 4, verified: 1, unverified: 3 },
      kept: { total: 3, keepAckey: 1, keepCategory: 2 }
    })
    expect(countChanges(run.plan)).toBe(1 + 4) // 削除 1 + 付け替え 4
    const lines = describeFix(options, run).join('\n')
    expect(lines).toContain('acsta に付け替える')
    expect(lines).toContain(': 4 件 = 確認済み 1 + 自動作成 3')
    expect(lines).toContain(
      '題がアクスタだが付け替えない: 3 件 = アクキーを含む題 1 + ackey・limited_card・regular_card 2'
    )
    expect(lines).toContain('[アクスタ+アクキーセット] category=other（アクキーを含む題）')
    // 書いていない
    const check = new Database(world.path, { readonly: true })
    expect(dump(check)).toEqual(before)
    check.close()
    expect(readdirSync(world.dir).filter((name) => name.startsWith('seed-backup-'))).toEqual([])
    const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
    expect(report.acsta.recategorize).toHaveLength(4)
    expect(report.acsta.kept).toHaveLength(3)
  })

  test('--apply: category と updated_at だけが変わる。確認済みの行も他の列は 1 列も変わらず、削除するイベントは付け替えない', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const keep = ['k-ackey', 'k-cat', 'k-card', 'done', 'badge']
    const beforeKeep = Object.fromEntries(keep.map((id) => [id, rowsOf(world.db, id)]))
    const beforeAcsta = Object.fromEntries(acstaIds.map((id) => [id, rowsOf(world.db, id)]))
    const beforeUserEvents = dump(world.db).user_events
    world.db.close()
    const run = await runFix(world.options({ apply: true }))
    expect(run.applied).toBeDefined()
    const after = new Database(world.path, { readonly: true })
    for (const id of acstaIds) {
      const row = categoryOfRow(after, id)
      expect(row).toEqual({ category: 'acsta', updated_at: NOW })
      // category と updated_at 以外の events の列、子の行は変わらない
      const now = rowsOf(after, id)
      const was = beforeAcsta[id]
      expect(now.event_stores).toEqual(was.event_stores)
      expect(now.event_reference_urls).toEqual(was.event_reference_urls)
      expect(now.event_conditions).toEqual(was.event_conditions)
      const { category: _c, updated_at: _u, ...changed } = z(now.events[0])
      const { category: _c0, updated_at: _u0, ...original } = z(was.events[0])
      expect(changed).toEqual(original)
    }
    // 確認済みの行は is_verified=1 のまま
    expect(
      after.query<{ is_verified: number }, []>("SELECT is_verified FROM events WHERE id = 'a-verified'").get()
    ).toEqual({ is_verified: 1 })
    // 付け替えない行は 1 列も変わらない
    for (const id of keep) expect(rowsOf(after, id)).toEqual(beforeKeep[id])
    // 削除するイベントは消え、付け替えられていない
    expect(rowsOf(after, 'a-gone').events).toEqual([])
    expect(after.query('SELECT * FROM user_events').all()).toEqual(beforeUserEvents)
    // 件数: 削除 1 件だけ減る（付け替えで行は増減しない）
    if (run.applied === undefined) throw new Error('not applied')
    expect(run.applied.after.events).toBe(run.applied.before.events - 1)
    after.close()
  })

  test('冪等: 2 回目は変更 0 件で、バックアップも書き込みもしない', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    world.db.close()
    await runFix(world.options({ apply: true }))
    const written = new Database(world.path, { readonly: true })
    const afterFirst = dump(written)
    written.close()
    const second = await runFix(world.options({ apply: true, now: '2026-10-10T03:05:00.000Z' }))
    expect(second.plan.recategorize).toEqual([])
    expect(countChanges(second.plan)).toBe(0)
    expect(second.applied).toBeUndefined()
    expect(readdirSync(world.dir).filter((name) => name.startsWith('seed-backup-'))).toHaveLength(1)
    const again = new Database(world.path, { readonly: true })
    expect(dump(again)).toEqual(afterFirst)
    again.close()
    // 2 回目も、アクスタだが付け替えない行は一覧に出る
    expect(second.plan.acstaKept.map((row) => row.id).sort()).toEqual(['k-ackey', 'k-card', 'k-cat'])
  })

  test('書く直前に category が変わっていたら（題と category が計画と違う）、ロールバックして止まる', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, events)
    const run = await runFix(world.options())
    world.db.run("UPDATE events SET category = 'ackey' WHERE id = 'a-verified'")
    const before = dump(world.db)
    expect(() => applyFix(world.db, run.plan, { now: NOW })).toThrow('expected 1 row(s) changed but 0 changed')
    expect(dump(world.db)).toEqual(before)
    world.db.close()
  })

  test('削除するイベントと付け替えを同時に計画しない（planAcsta は削除分を除く）', () => {
    const rows = [
      { id: 'x', title: 'アクスタ', category: 'other', isVerified: false },
      { id: 'y', title: 'アクスタ', category: 'other', isVerified: true }
    ]
    expect(planAcsta(rows, new Set(['x'])).recategorize.map((row) => row.id)).toEqual(['y'])
    expect(planAcsta(rows, new Set(['x', 'y']))).toEqual({ recategorize: [], acstaKept: [] })
  })
})

// ---------------------------------------------------------------------------------------------
// 本番 D1 用の SQL
// ---------------------------------------------------------------------------------------------

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('本番 D1 用の acsta の SQL', () => {
  const gold = [
    { uuid: UUID(1), title: 'アクリルスタンド', category: 'other' },
    { uuid: UUID(2), title: '店舗9周年記念アクスタ', category: 'other' },
    { uuid: UUID(3), title: 'アクスタ+アクキーセット', category: 'other' },
    { uuid: UUID(4), title: 'アクスタ', category: 'ackey' },
    { uuid: UUID(5), title: '夏名刺', category: 'limited_card' },
    { uuid: UUID(6), title: '店舗誕生25周年記念アクスタ(再配布)', category: 'other' },
    { uuid: UUID(7), title: 'アクスタ', category: 'acsta' }
  ]

  test('規則に当たるものだけを 1 行 1 件の UPDATE にし、先頭のコメントに件数・生成日時・元データを書く', () => {
    const { rows, text } = buildAcstaProductionSql(gold, {
      generatedAt: NOW,
      source: 'https://biccame-musume.com',
      fetchedAt: '2026-10-08T13:16:29.706Z'
    })
    expect(rows.map((row) => row.id).sort()).toEqual([UUID(1), UUID(2), UUID(6)])
    const lines = text.trimEnd().split('\n')
    const comments = lines.filter((line) => line.startsWith('--'))
    const updates = lines.filter((line) => !line.startsWith('--'))
    expect(comments[0]).toContain('category が other のイベントを acsta')
    expect(comments).toContain('-- 件数: 3')
    expect(comments).toContain(`-- 生成日時: ${NOW}`)
    expect(comments.some((line) => line.includes('gold.json') && line.includes('2026-10-08T13:16:29.706Z'))).toBe(true)
    expect(updates).toHaveLength(3)
    for (const line of updates)
      expect(line).toMatch(
        new RegExp(
          `^UPDATE events SET category='acsta', updated_at='${NOW}' WHERE id='[0-9a-f-]{36}' AND category='other';$`
        )
      )
    // D1 のリモート実行は BEGIN / COMMIT を受け付けない
    expect(text).not.toMatch(/BEGIN|COMMIT/i)
    // 同じ入力なら同じ出力（並びは題、同じなら id）
    expect(buildAcstaProductionSql(gold, { generatedAt: NOW, source: 's', fetchedAt: 'f' }).text).toBe(
      buildAcstaProductionSql([...gold].reverse(), { generatedAt: NOW, source: 's', fetchedAt: 'f' }).text
    )
  })

  test('uuid ではない id は SQL に入れず止まる（SQL への埋め込みを防ぐ）', () => {
    expect(() =>
      buildAcstaProductionSql([{ uuid: "x'; DROP TABLE events; --", title: 'アクスタ', category: 'other' }], {
        generatedAt: NOW,
        source: 's',
        fetchedAt: 'f'
      })
    ).toThrow('not a uuid')
  })

  test('--acsta-sql: ファイルに書き、ローカル D1 の同じ id の行（確認済み / そうでない / 無い）と照合して報告する', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(
      root,
      [
        { id: UUID(1), title: 'アクリルスタンド', category: 'other', startDay: '2026-04-01', verified: true },
        { id: UUID(2), title: '店舗9周年記念アクスタ', category: 'other', startDay: '2026-04-02', verified: true },
        // gold に無い確認済みのアクスタ（SQL に無いと報告される）
        { id: UUID(9), title: 'ローカルだけのアクスタ', category: 'other', startDay: '2026-04-03', verified: true }
      ],
      gold
    )
    const before = dump(world.db)
    world.db.close()
    const sqlPath = join(world.dir, 'acsta.sql')
    const options = world.options({ acstaSqlPath: sqlPath })
    const run = await runFix(options)
    const sql = run.acstaSql
    expect(sql).toBeDefined()
    expect(sql?.count).toBe(3)
    expect(sql?.goldEvents).toBe(7)
    expect(sql?.match).toEqual({ verified: 2, unverified: 0, absent: 1 })
    expect(sql?.rows.find((row) => row.id === UUID(6))?.local).toBeNull()
    expect(sql?.rows.find((row) => row.id === UUID(1))?.local).toEqual({ isVerified: true, category: 'other' })
    expect(sql?.localVerifiedNotInSql).toEqual([{ id: UUID(9), title: 'ローカルだけのアクスタ', category: 'other' }])
    const written = await readFile(sqlPath, 'utf8')
    expect(written.split('\n').filter((line) => line.startsWith('UPDATE'))).toHaveLength(3)
    const lines = describeFix(options, run).join('\n')
    expect(lines).toContain('本番 D1 用の SQL（作っただけで実行しない）')
    expect(lines).toContain('ローカル D1 の同じ id の行: 確認済み 2 / 確認済みではない 0 / 無い 1')
    const report = JSON.parse(await readFile(options.reportPath, 'utf8'))
    expect(report.acstaSql.count).toBe(3)
    // dry-run は DB を書かない
    const check = new Database(world.path, { readonly: true })
    expect(dump(check)).toEqual(before)
    check.close()
  })

  test('--acsta-sql を付けなければ SQL は作らない。.cache の外には書かない', async () => {
    const root = await tempRoot(directories)
    const world = await makeWorld(root, [], gold)
    world.db.close()
    const without = await runFix(world.options())
    expect(without.acstaSql).toBeUndefined()
    expect(readdirSync(world.dir).filter((name) => name.endsWith('.sql'))).toEqual([])
    await expect(runFix(world.options({ acstaSqlPath: join(root, 'outside.sql') }))).rejects.toThrow(
      '--acsta-sql must be under'
    )
  })
})

/** bun:sqlite の行（unknown）を、列名 → 値の連想配列として扱う */
const z = (row: unknown): Record<string, unknown> => {
  if (typeof row !== 'object' || row === null) throw new Error('not a row')
  return Object.fromEntries(Object.entries(row))
}
