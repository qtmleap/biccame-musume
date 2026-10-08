import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DROP_REASONS } from '@biccame/shared/event-detect/filter'
import { dayjs } from '../workers/bot/src/timeline/utils/dayjs'
import { analyze, coverageGaps, eventSummaries, funnel, keywordStats, missingGold } from './lib/event-detect/analysis'
import { ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { QUESTION_VERSION } from './lib/event-detect/decide'
import { buildEvalSet, runDecisions, scoreModel } from './lib/event-detect/evaluate'
import { fetchGoldEvents } from './lib/event-detect/gold'
import {
  convertArchive,
  readArchiveState,
  readGold,
  readMeta,
  readPosts,
  readStoreAccounts,
  readStoreNames,
  writeAtomic,
  writeGold
} from './lib/event-detect/store'

// イベント検出ビューワ用のデータ準備と集計。X・D1 には書き込まない。
//   prepare: list-timeline アーカイブを軽量 JSONL に変換し、公開 API から正解イベントを取得する
//   report : 機械フィルタのファネルと取りこぼしを標準出力に出す

const help = `Usage: bun scripts/event-detect.ts <prepare|report|eval> [options]
  prepare --archive PATH  list-timeline の posts.jsonl (default: .cache/list-timeline/year/posts.jsonl)
          --skip-posts    投稿の変換を省き、正解データだけ取り直す
          --skip-gold     正解データの取得を省く
  report  [--json]        ファネル・取りこぼし・登録漏れ候補を表示する
  eval    正解データに対して Clef / Clef-flash を流し、項目ごとの正解率を比べる
          --endpoint URL  decide API (default: http://127.0.0.1:15175/api/admin/event-detect/decide)
          --models LIST   clef,clef-flash (default: 両方)
          --negatives N   正解なしの通過投稿から抽出する件数 (default: 200)
          --dropped N     キーワードで落ちた投稿から抽出する件数 (default: 200)
          --concurrency N 同時リクエスト数 (default: 4)
          --limit N       評価する投稿数の上限（試運転用）
Common: --dir PATH (default: .cache/event-detect) --origin URL (default: https://biccame-musume.com)`

const root = resolve(import.meta.dir, '..')

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    archive: { type: 'string', default: resolve(root, '.cache/list-timeline/year/posts.jsonl') },
    dir: { type: 'string', default: resolve(root, '.cache/event-detect') },
    origin: { type: 'string', default: 'https://biccame-musume.com' },
    'skip-posts': { type: 'boolean', default: false },
    'skip-gold': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    endpoint: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    models: { type: 'string', default: 'clef,clef-flash' },
    negatives: { type: 'string', default: '200' },
    dropped: { type: 'string', default: '200' },
    concurrency: { type: 'string', default: '4' },
    limit: { type: 'string' },
    help: { type: 'boolean', default: false }
  }
})

const dir = resolve(values.dir)
const paths = {
  posts: resolve(dir, 'posts.jsonl'),
  gold: resolve(dir, 'gold.json'),
  meta: resolve(dir, 'meta.json'),
  labels: resolve(dir, 'labels.json'),
  characters: resolve(root, 'workers/app/public/characters.json')
}

const prepare = async () => {
  if (!values['skip-posts']) {
    const archive = resolve(values.archive)
    const state = await readArchiveState(archive)
    console.log(`Converting ${archive}`)
    if (!state.complete) console.warn('  archive is incomplete (manifest complete=false); some posts may be missing')
    const result = await convertArchive(archive, paths.posts, (lines) => process.stdout.write(`\r  ${lines} lines`))
    process.stdout.write('\n')
    const meta = { archive, ...state, posts: result.posts, lines: result.lines, skipped: result.skipped }
    await writeAtomic(paths.meta, `${JSON.stringify(meta, null, 2)}\n`)
    console.log(`  posts=${result.posts} skipped=${JSON.stringify(result.skipped)}`)
  }
  if (!values['skip-gold']) {
    console.log(`Fetching verified events from ${values.origin}`)
    const events = await fetchGoldEvents({
      baseUrl: values.origin,
      onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`)
    })
    process.stdout.write('\n')
    await writeGold(paths.gold, values.origin, events, dayjs().toISOString())
    console.log(`  events=${events.length}`)
  }
}

const pct = (part: number, whole: number) => (whole === 0 ? '-' : `${((part / whole) * 100).toFixed(1)}%`)

const report = async () => {
  const [posts, gold, accounts, meta] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readMeta(paths.meta)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts })
  const stages = funnel(analysis)
  const range = { from: Date.parse(meta.from), until: Date.parse(meta.until) }
  const missing = missingGold(analysis, range)
  const dropped = analysis.rows.filter((row) => row.gold.length > 0 && row.reason !== undefined)
  const gaps = coverageGaps(analysis)
  const events = eventSummaries(analysis)
  if (values.json) {
    console.log(JSON.stringify({ stages, missing, dropped: dropped.map((row) => row.post.id), gaps: gaps.length }))
    return
  }
  const total = stages[0].gold
  console.log(`posts=${posts.length} events=${gold.events.length} gold posts in archive=${total}`)
  console.log(`archive range ${meta.from} .. ${meta.until} complete=${meta.complete} pages=${meta.pages}\n`)
  console.log('stage'.padEnd(36), 'posts'.padStart(8), 'gold'.padStart(6), 'recall'.padStart(8), ' ann  sta  end')
  for (const stage of stages) {
    const t = stage.goldByType
    console.log(
      stage.label.padEnd(30),
      String(stage.posts).padStart(8),
      String(stage.gold).padStart(6),
      pct(stage.gold, total).padStart(8),
      String(t.announce).padStart(4),
      String(t.start).padStart(4),
      String(t.end).padStart(4)
    )
  }
  console.log('\nDropped gold posts by reason:')
  for (const reason of DROP_REASONS) {
    const rows = dropped.filter((row) => row.reason === reason)
    if (rows.length === 0) continue
    console.log(`  ${reason}: ${rows.length}`)
    for (const row of rows)
      console.log(
        `    ${row.post.createdAt.slice(0, 10)} @${row.post.screenName} ${row.post.text.replace(/\s+/g, ' ').slice(0, 70)}`
      )
  }
  const inRange = missing.filter((entry) => entry.inRange)
  console.log(`\nGold posts not in archive: ${missing.length} (in archive range: ${inRange.length})`)
  for (const entry of inRange) console.log(`  ${entry.id} @${entry.refs[0].screenName}`)
  console.log(
    `\nCoverage gaps (strong posts with no D1 event in window): ${gaps.reduce((n, g) => n + g.posts.length, 0)} posts / ${gaps.length} accounts`
  )
  for (const gap of gaps.slice(0, 15)) console.log(`  @${gap.account} [${gap.stores.join(',')}] ${gap.posts.length}`)
  const endCandidates = events.filter((event) => event.endCandidate)
  console.log(`\nEvents without end reference/endedAt but with end-keyword posts in window: ${endCandidates.length}`)
  const stats = keywordStats(analysis)
    .filter((stat) => stat.onlyGold > 0 || stat.onlyPosts > 300)
    .sort((a, b) => b.onlyGold - a.onlyGold)
  console.log('\nKeywords that alone carry gold posts (onlyGold) or many posts (onlyPosts):')
  for (const stat of stats)
    console.log(
      `  ${stat.keyword.padEnd(12)} posts=${stat.posts} gold=${stat.gold} onlyPosts=${stat.onlyPosts} onlyGold=${stat.onlyGold}`
    )
}

const evaluate = async () => {
  const [posts, gold, accounts] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts })
  const storeNames = await readStoreNames(paths.characters)
  const models = values.models.split(',').map((model) => {
    const parsed = ClefModelSchema.safeParse(model.trim())
    if (!parsed.success) throw new Error(`unknown model: ${model}`)
    return parsed.data
  })
  const all = buildEvalSet(analysis, { passed: Number(values.negatives), dropped: Number(values.dropped), seed: 20261008 })
  const samples = values.limit === undefined ? all : all.slice(0, Number(values.limit))
  console.log(
    `samples=${samples.length} (gold=${samples.filter((s) => s.kind === 'gold').length}, negative_passed=${samples.filter((s) => s.kind === 'negative_passed').length}, negative_dropped=${samples.filter((s) => s.kind === 'negative_dropped').length}) models=${models.join(',')}`
  )
  const decisions = await runDecisions({
    samples,
    models,
    analysis,
    accounts,
    storeNames,
    endpoint: values.endpoint,
    cacheDir: resolve(dir, 'clef', QUESTION_VERSION),
    concurrency: Number(values.concurrency),
    onProgress: (done, total, model) => process.stdout.write(`\r  ${model} ${done}/${total}`)
  })
  process.stdout.write('\n')
  const reports = models.map((model) => scoreModel(model, decisions, analysis))
  await writeAtomic(
    resolve(dir, `eval-${QUESTION_VERSION}.json`),
    `${JSON.stringify({ evaluatedAt: dayjs().toISOString(), version: QUESTION_VERSION, reports }, null, 2)}\n`
  )
  const rate = (t: { correct: number; total: number }) => `${pct(t.correct, t.total).padStart(6)} (${t.correct}/${t.total})`
  const line = (label: string, pick: (r: (typeof reports)[number]) => string) =>
    console.log(label.padEnd(28), ...reports.map((r) => pick(r).padEnd(26)))
  line('', (r) => r.model)
  line('calls', (r) => String(r.calls))
  line('input tokens', (r) => String(r.inputTokens))
  line('latency p50 / p95 (ms)', (r) => `${r.latency.p50} / ${r.latency.p95}`)
  line('is_event 正解の再現率', (r) => rate(r.isEvent.goldRecall))
  line('is_event 通過・正解なしで陽性', (r) => rate(r.isEvent.negativePassedRate))
  line('is_event キーワード落ちで陽性', (r) => rate(r.isEvent.negativeDroppedRate))
  line('ステータス', (r) => rate(r.status))
  line('種別', (r) => rate(r.category))
  line('店舗', (r) => rate(r.store))
  for (const [label, key] of [
    ['開始日', 'startDate'],
    ['終了日', 'endDate'],
    ['配布数', 'quantity']
  ] as const) {
    line(`${label}: 本文に正解あり`, (r) => rate(r[key].inText))
    line(`${label}: 本文に無い→none`, (r) => `${rate(r[key].notInText)} 候補0件${r[key].noCandidates}`)
  }
  line('終了したイベント', (r) => `${rate(r.endedEvent)} 候補なし${r.endedEvent.noCandidate}`)
  for (const r of reports) console.log(`\n[${r.model}] status confusion (gold → predicted):`, JSON.stringify(r.status.confusion))
}

if (values.help || positionals.length !== 1) console.log(help)
else if (positionals[0] === 'prepare') await prepare()
else if (positionals[0] === 'report') await report()
else if (positionals[0] === 'eval') await evaluate()
else console.log(help)
