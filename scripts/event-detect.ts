import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { ClefModelSchema } from '@biccame/shared/event-detect/clef'
import { DROP_REASONS } from '@biccame/shared/event-detect/filter'
import { dayjs } from '../workers/bot/src/timeline/utils/dayjs'
import {
  analyze,
  coverageGaps,
  eventSummaries,
  excludeStats,
  funnel,
  keywordStats,
  missingGold
} from './lib/event-detect/analysis'
import { QUESTION_VERSION } from './lib/event-detect/decide'
import { buildTimelines, LINK_VERSION, runEmulation } from './lib/event-detect/emulate'
import { scoreEmulation } from './lib/event-detect/emulate-score'
import { buildEvalSet, runDecisions, scoreModel } from './lib/event-detect/evaluate'
import {
  EXTRACT_VERSION,
  extractInput,
  extractKey,
  extractTargets,
  readExtraction,
  runExtract
} from './lib/event-detect/extract'
import { fetchGoldEvents } from './lib/event-detect/gold'
import { endpointFromEnv, JUDGE_MODEL, judgeTargets, runJudge } from './lib/event-detect/judge'
import {
  convertArchive,
  convertArchivePages,
  readArchiveState,
  readCharacterNames,
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

const help = `Usage: bun scripts/event-detect.ts <prepare|report|eval|judge> [options]
  prepare --archive PATH  list-timeline の posts.jsonl (default: .cache/list-timeline/year/posts.jsonl)
          --pages         posts.jsonl ではなく同じアーカイブの pages/*.json から読む（取得中でも最新）
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
  extract 通過した投稿から配布イベントを抽出する（質問 v2、1 投稿から複数件）。オプションは judge と同じ
  emulate 抽出済みの投稿を店舗ごとに古い順に読み、イベント一覧を作って D1 と突き合わせる
          --since / --before で読む期間、--eval-from / --eval-until で D1 と比べる期間を指定
  judge   通過した投稿を Claude Haiku 5.5 で判定し .cache の judge/ に保存する（保存済みは呼ばない）
          --before ISO    この時刻より前の投稿だけ（例: 2025-10-07T15:00:00Z）
          --since ISO     この時刻以降の投稿だけ
          --concurrency N 同時リクエスト数 (default: 16)
          --limit N       判定する件数の上限（試運転用）
          環境変数 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN が必要
Common: --dir PATH (default: .cache/event-detect) --origin URL (default: https://biccame-musume.com)`

const root = resolve(import.meta.dir, '..')

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    archive: { type: 'string', default: resolve(root, '.cache/list-timeline/year/posts.jsonl') },
    dir: { type: 'string', default: resolve(root, '.cache/event-detect') },
    origin: { type: 'string', default: 'https://biccame-musume.com' },
    pages: { type: 'boolean', default: false },
    'skip-posts': { type: 'boolean', default: false },
    'skip-gold': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    endpoint: { type: 'string', default: 'http://127.0.0.1:15175/api/admin/event-detect/decide' },
    models: { type: 'string', default: 'clef,clef-flash' },
    negatives: { type: 'string', default: '200' },
    dropped: { type: 'string', default: '200' },
    concurrency: { type: 'string' },
    before: { type: 'string' },
    since: { type: 'string' },
    'eval-from': { type: 'string' },
    'eval-until': { type: 'string' },
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
    const pagesDir = resolve(archive, '../pages')
    console.log(`Converting ${values.pages ? pagesDir : archive}`)
    if (!state.complete) console.warn('  archive is incomplete (manifest complete=false); some posts may be missing')
    const progress = (lines: number) => process.stdout.write(`\r  ${lines} records`)
    const fromPages = values.pages ? await convertArchivePages(pagesDir, paths.posts, progress) : undefined
    const result = fromPages ? fromPages : await convertArchive(archive, paths.posts, progress)
    process.stdout.write('\n')
    if (fromPages && fromPages.badPages > 0)
      console.warn(
        `  ${fromPages.badPages}/${fromPages.pages} pages could not be read (error responses) and were skipped`
      )
    const meta = {
      archive: fromPages ? pagesDir : archive,
      ...state,
      posts: result.posts,
      lines: result.lines,
      skipped: result.skipped,
      ...(fromPages ? { pageFiles: fromPages.pages, badPages: fromPages.badPages } : {})
    }
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
  const [posts, gold, accounts, characterNames, meta] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters),
    readMeta(paths.meta)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
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
  const excludes = excludeStats(analysis).sort((a, b) => b.posts - a.posts)
  console.log('\nExclude words (posts dropped if alone / rescued gold / dropped gold):')
  for (const stat of excludes.slice(0, 20))
    console.log(
      `  ${stat.keyword.padEnd(12)} posts=${stat.posts} only=${stat.onlyPosts} gold=${stat.gold} rescuedGold=${stat.rescuedGold} droppedGold=${stat.droppedGold}`
    )
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
  const [posts, gold, accounts, characterNames] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
  const storeNames = await readStoreNames(paths.characters)
  const models = values.models.split(',').map((model) => {
    const parsed = ClefModelSchema.safeParse(model.trim())
    if (!parsed.success) throw new Error(`unknown model: ${model}`)
    return parsed.data
  })
  const all = buildEvalSet(analysis, {
    passed: Number(values.negatives),
    dropped: Number(values.dropped),
    seed: 20261008
  })
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
    concurrency: Number(values.concurrency === undefined ? '4' : values.concurrency),
    onProgress: (done, total, model) => process.stdout.write(`\r  ${model} ${done}/${total}`)
  })
  process.stdout.write('\n')
  const reports = models.map((model) => scoreModel(model, decisions, analysis))
  await writeAtomic(
    resolve(dir, `eval-${QUESTION_VERSION}.json`),
    `${JSON.stringify({ evaluatedAt: dayjs().toISOString(), version: QUESTION_VERSION, reports }, null, 2)}\n`
  )
  const rate = (t: { correct: number; total: number }) =>
    `${pct(t.correct, t.total).padStart(6)} (${t.correct}/${t.total})`
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
  for (const r of reports)
    console.log(`\n[${r.model}] status confusion (gold → predicted):`, JSON.stringify(r.status.confusion))
}

const judge = async () => {
  const [posts, gold, accounts, characterNames, storeNames] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters),
    readStoreNames(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
  const before = values.before ? Date.parse(values.before) : Number.POSITIVE_INFINITY
  const since = values.since ? Date.parse(values.since) : Number.NEGATIVE_INFINITY
  if (Number.isNaN(before) || Number.isNaN(since)) throw new Error('--before / --since must be ISO timestamps')
  const rows = analysis.rows.filter((row) => row.reason === undefined && since <= row.time && row.time < before)
  const all = judgeTargets(rows, analysis, accounts, storeNames)
  const targets = values.limit === undefined ? all : all.slice(0, Number(values.limit))
  const cacheDir = resolve(dir, 'judge', JUDGE_MODEL, QUESTION_VERSION)
  const concurrency = Number(values.concurrency === undefined ? '16' : values.concurrency)
  console.log(
    `posts=${rows.length} targets=${targets.length} (of ${all.length}) concurrency=${concurrency} cache=${cacheDir}`
  )
  const started = performance.now()
  const result = await runJudge({
    targets,
    cacheDir,
    concurrency,
    endpoint: endpointFromEnv(),
    onProgress: (progress) => {
      if (progress.done % 100 !== 0 && progress.done !== progress.total) return
      const called = progress.done - progress.cached
      const rate = called / ((performance.now() - started) / 1000)
      const left = progress.total - progress.done
      const eta = rate > 0 ? Math.round(left / rate / 60) : 0
      console.log(
        `${dayjs().format('HH:mm:ss')} ${progress.done}/${progress.total} cached=${progress.cached} failed=${progress.failed} 429=${progress.stats.rateLimited} 5xx=${progress.stats.serverErrors} invalid=${progress.stats.invalid} rate=${rate.toFixed(2)}/s eta=${eta}min tokens=${progress.inputTokens}/${progress.outputTokens}`
      )
    },
    onError: (target, error) => console.error(`failed ${target.row.post.id}: ${String(error).slice(0, 200)}`)
  })
  const cost = (result.inputTokens * 0.1 + result.outputTokens * 0.5) / 1e6
  console.log(
    `done ${result.done}/${result.total} cached=${result.cached} failed=${result.failed} tokens in=${result.inputTokens} out=${result.outputTokens} est=$${cost.toFixed(2)} (input $0.10 / output $0.50 per 1M)`
  )
}

const extract = async () => {
  const [posts, gold, accounts, characterNames, storeNames] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters),
    readStoreNames(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
  const before = values.before ? Date.parse(values.before) : Number.POSITIVE_INFINITY
  const since = values.since ? Date.parse(values.since) : Number.NEGATIVE_INFINITY
  if (Number.isNaN(before) || Number.isNaN(since)) throw new Error('--before / --since must be ISO timestamps')
  const rows = analysis.rows.filter((row) => row.reason === undefined && since <= row.time && row.time < before)
  const all = extractTargets(rows, accounts, storeNames)
  const targets = values.limit === undefined ? all : all.slice(0, Number(values.limit))
  const cacheDir = resolve(dir, 'extract', JUDGE_MODEL, EXTRACT_VERSION)
  const concurrency = Number(values.concurrency === undefined ? '16' : values.concurrency)
  console.log(
    `posts=${rows.length} targets=${targets.length} (of ${all.length}) concurrency=${concurrency} cache=${cacheDir}`
  )
  const started = performance.now()
  const result = await runExtract({
    targets,
    cacheDir,
    concurrency,
    endpoint: endpointFromEnv(),
    onProgress: (progress) => {
      if (progress.done % 100 !== 0 && progress.done !== progress.total) return
      const called = progress.done - progress.cached
      const rate = called / ((performance.now() - started) / 1000)
      const eta = rate > 0 ? Math.round((progress.total - progress.done) / rate / 60) : 0
      console.log(
        `${dayjs().format('HH:mm:ss')} ${progress.done}/${progress.total} cached=${progress.cached} failed=${progress.failed} 429=${progress.stats.rateLimited} 5xx=${progress.stats.serverErrors} invalid=${progress.stats.invalid} rate=${rate.toFixed(2)}/s eta=${eta}min tokens=${progress.inputTokens}/${progress.outputTokens}`
      )
    },
    onError: (target, error) => console.error(`failed ${target.row.post.id}: ${String(error).slice(0, 200)}`)
  })
  const cost = (result.inputTokens * 0.1 + result.outputTokens * 0.5) / 1e6
  console.log(
    `done ${result.done}/${result.total} cached=${result.cached} failed=${result.failed} tokens in=${result.inputTokens} out=${result.outputTokens} est=$${cost.toFixed(2)}`
  )
}

const emulate = async () => {
  const [posts, gold, accounts, characterNames, storeNames] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters),
    readStoreNames(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
  const before = values.before ? Date.parse(values.before) : Number.POSITIVE_INFINITY
  const since = values.since ? Date.parse(values.since) : Number.NEGATIVE_INFINITY
  const rows = analysis.rows.filter((row) => row.reason === undefined && since <= row.time && row.time < before)
  const extractDir = resolve(dir, 'extract', JUDGE_MODEL, EXTRACT_VERSION)
  const items: Parameters<typeof buildTimelines>[0][number][] = []
  const missing = { count: 0 }
  for (const row of rows) {
    const input = extractInput(row.post, accounts, storeNames)
    const extraction = await readExtraction(extractDir, extractKey(input))
    if (extraction) items.push({ row, extraction, state: input.state })
    else missing.count += 1
  }
  const timelines = buildTimelines(items, accounts)
  const mentions = [...timelines.values()].reduce((sum, list) => sum + list.length, 0)
  console.log(
    `posts=${rows.length} extracted=${items.length} missing=${missing.count} stores=${timelines.size} mentions=${mentions}`
  )
  const started = performance.now()
  const { events, progress } = await runEmulation({
    timelines,
    endpoint: endpointFromEnv(),
    cacheDir: resolve(dir, 'emulate', JUDGE_MODEL, LINK_VERSION),
    concurrency: Number(values.concurrency === undefined ? '32' : values.concurrency),
    onProgress: (p) => {
      if (p.mentionsDone % 200 !== 0 && p.mentionsDone !== p.mentions) return
      const elapsed = (performance.now() - started) / 1000
      console.log(
        `${dayjs().format('HH:mm:ss')} ${p.mentionsDone}/${p.mentions} stores ${p.storesDone}/${p.stores} calls=${p.calls} cached=${p.cachedCalls} created=${p.created} linked=${p.linked} ignored=${p.ignored} failed=${p.failed} 429=${p.stats.rateLimited} elapsed=${Math.round(elapsed)}s`
      )
    },
    onError: (mention, error) =>
      console.error(`failed ${mention.store} ${mention.row.post.id}: ${String(error).slice(0, 200)}`)
  })
  await writeAtomic(resolve(dir, `emulated-${LINK_VERSION}.json`), `${JSON.stringify(events, null, 1)}\n`)
  const cost = (progress.inputTokens * 0.1 + progress.outputTokens * 0.5) / 1e6
  console.log(
    `events=${events.length} calls=${progress.calls} (cached ${progress.cachedCalls}) failed=${progress.failed} est=$${cost.toFixed(2)}`
  )
  const from = values['eval-from'] ? Date.parse(values['eval-from']) : Number.NaN
  const until = values['eval-until'] ? Date.parse(values['eval-until']) : Number.NaN
  if (Number.isNaN(from) || Number.isNaN(until)) return
  const score = scoreEmulation({
    events,
    gold: gold.events,
    analysis,
    from,
    until,
    stores: new Set(accounts.map((account) => account.storeId))
  })
  const rate = (part: number, whole: number) => `${pct(part, whole)} (${part}/${whole})`
  console.log(`\nD1 との突き合わせ（${values['eval-from']} 〜 ${values['eval-until']}）`)
  console.log(`  D1 のイベント（店舗ごと）を作れた        ${rate(score.matched, score.gold)}`)
  console.log(`  作ったイベントのうち D1 に対応あり      ${rate(score.matched, score.emulated)}`)
  console.log(`  同じイベントの作りすぎ                 ${score.duplicates}`)
  console.log(`  D1 に無いイベント                      ${score.extra}`)
  console.log(`  種別のまとまり（名刺/アクキー/他）一致  ${rate(score.categoryAgree, score.matched)}`)
  console.log(`  開始日が一致（開始日が取れたもの）      ${rate(score.startExact, score.startKnown)}`)
  console.log(`  終了を検出（D1 に実終了日時あり）       ${rate(score.ended.detected, score.ended.gold)}`)
  console.log(`  終了日が ±3 日以内                     ${rate(score.ended.within3Days, score.ended.gold)}`)
  console.log(
    `  参考 URL の投稿が同じイベントに入った   ${rate(score.postLinks.inMatchedEvent, score.postLinks.total)}`
  )
  await writeAtomic(
    resolve(dir, `emulated-${LINK_VERSION}-score.json`),
    `${JSON.stringify(
      {
        ...score,
        unmatchedGold: score.unmatchedGold.map((pair) => ({
          uuid: pair.event.uuid,
          title: pair.event.title,
          store: pair.store,
          startDate: pair.event.startDate
        }))
      },
      null,
      1
    )}\n`
  )
}

if (values.help || positionals.length !== 1) console.log(help)
else if (positionals[0] === 'prepare') await prepare()
else if (positionals[0] === 'report') await report()
else if (positionals[0] === 'eval') await evaluate()
else if (positionals[0] === 'judge') await judge()
else if (positionals[0] === 'extract') await extract()
else if (positionals[0] === 'emulate') await emulate()
else console.log(help)
