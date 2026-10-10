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
  filterStages,
  keywordStats,
  missingGold
} from './lib/event-detect/analysis'
import {
  CLEF_PRICE_PER_MILLION,
  clefCost,
  probabilityHistogram,
  readRepresentativePosts,
  resolveTargets,
  runClefEvents
} from './lib/event-detect/clef-run'
import { QUESTION_VERSION } from './lib/event-detect/decide'
import { buildTimelines, LINK_VERSION, runEmulation } from './lib/event-detect/emulate'
import { scoreEmulation } from './lib/event-detect/emulate-score'
import { clefVerifier, VERIFY_VERSION } from './lib/event-detect/verify'
import { buildEvalSet, runDecisions, scoreModel } from './lib/event-detect/evaluate'
import {
  EXTRACT_VERSION,
  extractInput,
  extractKey,
  extractTargets,
  readExtraction,
  runExtract
} from './lib/event-detect/extract'
import { gapRows, resolveGapEvents, writeGapEvents } from './lib/event-detect/gap-events'
import { fetchGoldEvents } from './lib/event-detect/gold'
import { endpointFromEnv, JUDGE_MODEL, judgeTargets, runJudge } from './lib/event-detect/judge'
import { assertDay, DEFAULT_SEED_SINCE, DEFAULT_TITLE_CONCURRENCY, describeSeed, runSeed } from './lib/event-detect/seed'
import { describeFix, runFix } from './lib/event-detect/seed-fix'
import type { TitleProgress, TitleTarget } from './lib/event-detect/seed-title'
import { createViewerHandler } from './lib/event-detect/serve'
import {
  convertArchive,
  convertArchivePages,
  loadViewerApi,
  readArchiveState,
  readCharacterNames,
  readGold,
  readMeta,
  readPosts,
  readStoreAccounts,
  readStoreBirthdays,
  readStoreNames,
  writeAtomic,
  writeGold
} from './lib/event-detect/store'

// イベント検出ビューワ用のデータ準備と集計。X・本番の D1 には書き込まない（書くのは seed のローカル D1 だけ）。
//   prepare: list-timeline アーカイブを軽量 JSONL に変換し、公開 API から正解イベントを取得する
//   report : 機械フィルタの絞り込みの段階と取りこぼしを標準出力に出す
//   seed   : emulate のイベントのうち Clef の判定も通ったものを、ローカル D1（.wrangler/state）にイベントとして作る

const help = `Usage: bun scripts/event-detect.ts <prepare|report|eval|judge|extract|emulate|gaps|clef|seed|serve> [options]
  prepare --archive PATH  list-timeline の posts.jsonl (default: .cache/list-timeline/year/posts.jsonl)
          --pages         posts.jsonl ではなく同じアーカイブの pages/*.json から読む（取得中でも最新）
          --skip-posts    投稿の変換を省き、正解データだけ取り直す
          --skip-gold     正解データの取得を省く
          各店舗アカウントの、擬人化記念日（characters.json の birthday、JST）より前の投稿は除く
  report  [--json]        絞り込みの段階・取りこぼし・登録漏れ候補を表示する
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
          --verify clef|clef-flash  「新規」と判断された言及を Clef で再確認し、既存のイベントなら合流させる
          --verify-threshold P      合流させる確率のしきい値 (default: 0.7)
          --endpoint URL            Clef の decide API（eval と同じ）。再確認は同時 6 件まで
  gaps    登録漏れ候補の投稿を店舗ごとに古い順に読み、同じイベントをまとめて言及回数つきの一覧にする（gap-events.json）
          未抽出の投稿は抽出してから読む。--since / --before は使わない（候補は分析から決まる）
          --verify clef|clef-flash  「新規」と判断された言及を Clef で再確認し、既存のイベントなら合流させる
          --verify-threshold P      合流させる確率のしきい値（emulate と同じ）
          --endpoint URL            Clef の decide API（emulate と同じ）
          --concurrency N           同時リクエスト数（抽出 16 / 照合 32）
          環境変数 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN が必要
  clef    emulate が作ったイベントの代表投稿（そのイベントを作った最初の言及。同じ投稿は 1 件にまとめる）を Clef で判定し、
          is_event の確率を .cache の clef/ に保存する（保存済みは呼ばない）。事前に emulate が必要
          1 件の失敗では止まらず、失敗した投稿があれば終了コード 1 で終わる。再実行すると失敗した分だけを呼び直す
          --model clef|clef-flash  使うモデル (default: clef。入力 100 万トークンあたり $${CLEF_PRICE_PER_MILLION.clef} / $${CLEF_PRICE_PER_MILLION['clef-flash']})
          --since ISO / --before ISO  代表投稿の時刻での絞り込み（judge と同じ）
          --endpoint URL   decide API（eval と同じ）
          --concurrency N  同時リクエスト数 (default: 8)
          --limit N        判定する件数の上限（試運転用。絞り込みの後の先頭 N 件）
  seed    emulate が作った LLM イベントのうち、Clef の判定も通ったものを、ローカル D1 にイベントとして作る（INSERT のみ。既存の行は変えない）
          対象: 代表投稿（最初の言及）の Clef の確率がしきい値以上 / 開始日あり / 期間内 / 本番 D1（gold.json）に同じ投稿の言及が無く、同じ店舗の同じ開始日のイベントも無い / ローカル D1 に同じ店舗の同じ開始日のイベントが無い / 参考 URL を 1 件以上作れる / 店舗キーが characters.json にある / 店舗がビッカメ娘（characters.json の character.is_biccame_musume が true。ビックカメラ・ビックシムたん・ナイセン・お偉いたん・Airたんは対象外）/ アプリの StoreKeySchema にある
          タイトルは D1 の命名規範に合わせる。既定は Claude Haiku 5.5 で命名する（--titles llm）: item・カテゴリ・開始日・店舗のキャラ名/店舗名（入れてはいけない語）・代表的な投稿本文に、D1 のタイトルの手本（gold.json から実行時に作る）を添えて聞く
          命名の結果は .cache/event-detect/seed-title/<モデル>/<バージョン>/ に保存し、保存済みは呼ばない（dry-run でも呼ぶ。後の --apply では呼ばない）。1 件の失敗では止まらない（--apply は命名に失敗が残っていれば書かずに止まる。再実行で失敗分だけ呼ぶ）
          題は検査する（空でない / 30 文字以内 / 括弧類なし / キャラ名・店舗名なし / D1 に同じ題の企画があるなら配布物の種別が同じ）。落ちたらルールベースの題（LLM の item からキャラ名・店舗名を除き、表記を寄せる。季節は開始月から補う。日本語の間の空白は詰める）を使い、理由をレポートに残す。ルールの題も括弧類・説明語・汎用名（グッズ）・キャラ名などで検査し、落ちたイベントは作らない（段階表とログとレポートに残る）
          配布数（quantity）が 10 未満のものは「おひとり様 N 枚」の読み違い、1000 を超えるものは名刺以外の配布物や店舗全体の総数の読み違いとして捨てる（limited_quantity なし・配布条件は everyone。確認済みの最大は 200）
          参考 URL は言及の種別ごとに最初の 1 件（announce / start / end）。最初の告知か開始の言及がリプライのイベントは作らない（リプライを飛ばして次の投稿を選ぶことはしない）。終了のリプライは可。is_verified は false、配布条件は先着（配布数あり）か誰でも
          終了予定日も終了日も無いイベントは、最後の言及から 30 日以上たっていれば、最後の言及の日（JST）を終了日（ended_at）に推定で入れる（30 日未満は今も配布中かもしれないので null）
          終了が分からないまま止まっているイベント（終了予定日も終了日も無く、最後の言及が開始日より前で終了日を推定できず、開始が基準日の 30 日以上前）は作らない（アプリが永久に「開催中」と表示するため。命名の前に除くので Haiku も呼ばない）
          カテゴリは LLM の判定のまま作るが、題（命名後）がアクスタ・アクリルスタンドで、アクキー・キーホルダーを含まない other は acsta にする（アクスタ+アクキーセットのような題や、ackey・名刺は変えない）。D1 の同名の題との種別の照合では acsta と other を同じとみなす
          既定は --dry-run（書かない。レポートと件数だけ出す）。書くのは --apply のときだけで、書く前に .cache/event-detect/seed-backup-<時刻>.sqlite に VACUUM INTO でバックアップする
          書き込み先は .wrangler/state 配下のローカル D1 だけ（それ以外のパスは拒否。wrangler は使わない）。dev サーバーが使用中でも、短い 1 トランザクションで書く
          --dry-run / --apply       --apply と --dry-run を両方付けたら dry-run
          --clef-threshold P        Clef の is_event の確率のしきい値 (default: 0.7)
          --since D / --before D    開始日（JST、YYYY-MM-DD）の期間。since 以上・before 未満 (default since: 2023-01-01)
          --all-years               既定の下限（2023-01-01）を外す（--since / --before を明示すればそれは効く）
          --limit N                 作るイベントを開始日の新しい順に先頭 N 件に絞る（試運転用）
          --titles llm|rule         タイトルの付け方 (default: llm。rule は命名せずルールベースの題だけ。環境変数 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN は llm のときだけ要る)
          --concurrency N           命名の同時リクエスト数 (default: 16)
          --force                   ローカル D1 の既存行との照合を省く（二重に作る恐れがあるので通常は使わない）
          --report PATH             作るイベントの一覧（JSON）の出力先 (default: .cache/event-detect/seed-report.json。.cache 配下のみ)。--dry-run でも書く
          --db PATH                 ローカル D1 の SQLite (default: .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite)
  seed --fix  すでに作った自動作成分（is_verified=0）を今の規則で直す。確認済み（is_verified=1）の行は変えない（5 の acsta への付け替えだけ category を変える）。--dry-run が既定で、1 回のバックアップ・1 トランザクションで書く
          1. 告知か開始の参考 URL がリプライの投稿のイベント、または店舗がビッカメ娘ではない（characters.json の character.is_biccame_musume が false）イベントは、イベントごと削除する（子の行も明示的に消す）。他のテーブル（user_events など）が参照していれば削除せずに報告する。参考 URL の行を差し替えることはしない（終了のリプライは問題にしない）。削除の理由（リプライだけ / 店舗だけ / 両方）を数える
          2. 削除しないイベントのうち、終了予定日も終了日も無く、最後の言及から 30 日以上たったものに、最後の言及の日を ended_at として入れる
          3. 削除しないイベントのうち、配布数が 1000 を超えるものは、limited_quantity を null、配布条件を everyone（quantity なし）にする
          4. 終了が分からないまま止まっているイベント（終了予定日も終了日も無く、最後の言及が開始日より前で終了日を推定できず、開始が基準日の 30 日以上前）は、2 を先に評価して入らなかったものを削除する（最後の言及が最近のものは残す。他のテーブルが参照していれば削除しない）
          5. 題がアクスタ・アクリルスタンドで、アクキー・キーホルダーを含まない category=other のイベントを acsta に付け替える（updated_at も更新）。確認済み（is_verified=1）の行も対象。削除するイベントは対象外。アクキーと一緒の題・ackey / 名刺のカテゴリは変えずに一覧で報告する
          イベントと emulate のイベントの対応は、--from-report のレポートの (店舗, 開始日, 題, 作成時刻) で 1 対 1 に引く。引けなかったイベントは触らない
          --from-report PATH        対応付けに使う seed --apply のレポート（繰り返し指定できる。default: .cache/event-detect/seed-report-applied.json と seed-report-applied-allyears.json）
          --report PATH             直しの計画（JSON）の出力先 (default: .cache/event-detect/seed-fix-report.json。.cache 配下のみ)。--dry-run でも書く
          --acsta-sql PATH          本番 D1 用の SQL の出力先（.cache 配下のみ）。gold.json（本番の確認済みイベント）のうち 5 の規則に当たるものを UPDATE events SET category='acsta' ... AND category='other' で 1 行 1 件書き、ローカル D1 の同じ id の行と照合する。実行はしない。省略すると作らない
          --dry-run / --apply / --db は seed と同じ
  judge   通過した投稿を Claude Haiku 5.5 で判定し .cache の judge/ に保存する（保存済みは呼ばない）
          --before ISO    この時刻より前の投稿だけ（例: 2025-10-07T15:00:00Z）
          --since ISO     この時刻以降の投稿だけ
          --concurrency N 同時リクエスト数 (default: 16)
          --limit N       判定する件数の上限（試運転用）
          環境変数 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN が必要
  serve   ビューワの API をローカル専用（127.0.0.1）で配信する。画面は dev サーバーの /admin/event-detect が /__event-detect 経由で呼ぶ
          bun --hot の子プロセスで動き、ソースを書き換えると同じプロセス・同じポートのままハンドラだけ差し替わる（データは次のリクエストで読み直す。再読み込みのたびに listening 行が出る）
          prepare でデータ（posts.jsonl / meta.json / gold.json）を書き換えると、次のリクエストで読み直す（再起動は要らない）
          --port N       待ち受けポート (default: 15176)
Common: --dir PATH (default: .cache/event-detect) --origin URL (default: https://biccame-musume.com)`

const root = resolve(import.meta.dir, '..')

/** bun run migrate と dev サーバーが使うローカル D1（--persist-to .wrangler/state）の SQLite */
const LOCAL_D1_PATH = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/62a34a811f0a7cc8f5790988a0da51e6e1467bf09e73ceef9a5576fb0d4ed81d.sqlite'

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
    model: { type: 'string', default: 'clef' },
    negatives: { type: 'string', default: '200' },
    dropped: { type: 'string', default: '200' },
    concurrency: { type: 'string' },
    before: { type: 'string' },
    since: { type: 'string' },
    verify: { type: 'string' },
    'verify-threshold': { type: 'string', default: '0.7' },
    'eval-from': { type: 'string' },
    'eval-until': { type: 'string' },
    limit: { type: 'string' },
    port: { type: 'string', default: '15176' },
    'dry-run': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    'clef-threshold': { type: 'string', default: '0.7' },
    'all-years': { type: 'boolean', default: false },
    titles: { type: 'string', default: 'llm' },
    force: { type: 'boolean', default: false },
    report: { type: 'string' },
    fix: { type: 'boolean', default: false },
    'from-report': { type: 'string', multiple: true },
    'acsta-sql': { type: 'string' },
    db: { type: 'string', default: resolve(root, LOCAL_D1_PATH) },
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
    // 各店舗アカウントの擬人化記念日（JST 0 時）。それより前の投稿は変換の時点で除く
    const birthdays = await readStoreBirthdays(paths.characters)
    const fromPages = values.pages ? await convertArchivePages(pagesDir, paths.posts, progress, birthdays) : undefined
    const result = fromPages ? fromPages : await convertArchive(archive, paths.posts, progress, birthdays)
    process.stdout.write('\n')
    if (fromPages && fromPages.badPages > 0)
      console.warn(
        `  ${fromPages.badPages}/${fromPages.pages} pages could not be read (error responses) and were skipped`
      )
    // manifest の投稿数は投稿 ID の重複を除いた数で、変換側も重複を先に除くので、記念日で除いた分を足せば揃う
    const beforeBirthday = 'before_birthday' in result.skipped ? result.skipped.before_birthday : 0
    if (result.posts + beforeBirthday !== state.archivePosts) {
      // posts.jsonl は取得の最後にしか書き直されないので、取得中は manifest より古い
      const hint = fromPages ? '' : '; posts.jsonl is rewritten only when a capture finishes (use --pages for the latest pages)'
      console.warn(
        `  converted ${result.posts} posts (+ ${beforeBirthday} before birthday) but manifest reports ${state.archivePosts}${hint}`
      )
    }
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
  const stages = filterStages(analysis)
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

/** --verify の指定から、Clef による再確認の設定を作る。指定が無ければ verify は undefined */
const verifyOptions = async () => {
  const parsedModel = ClefModelSchema.safeParse(values.verify)
  if (values.verify !== undefined && !parsedModel.success) throw new Error(`unknown --verify model: ${values.verify}`)
  const model = parsedModel.success ? parsedModel.data : undefined
  const threshold = Number(values['verify-threshold'])
  const verify = model
    ? {
        check: await clefVerifier({
          endpoint: values.endpoint,
          model,
          cacheDir: resolve(dir, 'verify', model, VERIFY_VERSION),
          concurrency: 6
        }),
        threshold
      }
    : undefined
  return { verify, model, threshold }
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
  const { verify, model: verifyModel, threshold } = await verifyOptions()
  // 比較の実行どうしが出力を上書きしないよう、再確認の設定をファイル名に入れる
  const tag = verifyModel ? `-${verifyModel}-${threshold}` : ''
  const { events, progress } = await runEmulation({
    timelines,
    endpoint: endpointFromEnv(),
    cacheDir: resolve(dir, 'emulate', JUDGE_MODEL, LINK_VERSION),
    concurrency: Number(values.concurrency === undefined ? '32' : values.concurrency),
    ...(verify ? { verify } : {}),
    onProgress: (p) => {
      if (p.mentionsDone % 200 !== 0 && p.mentionsDone !== p.mentions) return
      const elapsed = (performance.now() - started) / 1000
      console.log(
        `${dayjs().format('HH:mm:ss')} ${p.mentionsDone}/${p.mentions} stores ${p.storesDone}/${p.stores} calls=${p.calls} cached=${p.cachedCalls} created=${p.created} linked=${p.linked} ignored=${p.ignored} failed=${p.failed} verified=${p.verified} merged=${p.merged} verifyFailed=${p.verifyFailed} 429=${p.stats.rateLimited} elapsed=${Math.round(elapsed)}s`
      )
    },
    onError: (mention, error) =>
      console.error(`failed ${mention.store} ${mention.row.post.id}: ${String(error).slice(0, 200)}`)
  })
  await writeAtomic(resolve(dir, `emulated-${LINK_VERSION}${tag}.json`), `${JSON.stringify(events, null, 1)}\n`)
  const cost = (progress.inputTokens * 0.1 + progress.outputTokens * 0.5) / 1e6
  console.log(
    `events=${events.length} calls=${progress.calls} (cached ${progress.cachedCalls}) failed=${progress.failed} verified=${progress.verified} merged=${progress.merged} verifyFailed=${progress.verifyFailed} est=$${cost.toFixed(2)}`
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
    resolve(dir, `emulated-${LINK_VERSION}${tag}-score.json`),
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

const gaps = async () => {
  const [posts, gold, accounts, characterNames, storeNames] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters),
    readStoreNames(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
  const rows = gapRows(analysis)
  console.log(`登録漏れ投稿 ${rows.length} 件`)
  const { verify, model, threshold } = await verifyOptions()
  const started = performance.now()
  const result = await resolveGapEvents({
    rows,
    accounts,
    storeNames,
    endpoint: endpointFromEnv(),
    extractDir: resolve(dir, 'extract', JUDGE_MODEL, EXTRACT_VERSION),
    emulateDir: resolve(dir, 'emulate', JUDGE_MODEL, LINK_VERSION),
    extractConcurrency: Number(values.concurrency === undefined ? '16' : values.concurrency),
    emulateConcurrency: Number(values.concurrency === undefined ? '32' : values.concurrency),
    ...(verify ? { verify } : {}),
    onExtractProgress: (p) => {
      if (p.done % 50 !== 0 && p.done !== p.total) return
      console.log(
        `${dayjs().format('HH:mm:ss')} extract ${p.done}/${p.total} cached=${p.cached} failed=${p.failed} 429=${p.stats.rateLimited} 5xx=${p.stats.serverErrors} invalid=${p.stats.invalid}`
      )
    },
    onEmulateProgress: (p) => {
      if (p.mentionsDone % 50 !== 0 && p.mentionsDone !== p.mentions) return
      console.log(
        `${dayjs().format('HH:mm:ss')} link ${p.mentionsDone}/${p.mentions} stores ${p.storesDone}/${p.stores} calls=${p.calls} cached=${p.cachedCalls} created=${p.created} linked=${p.linked} ignored=${p.ignored} failed=${p.failed} verified=${p.verified} merged=${p.merged} elapsed=${Math.round((performance.now() - started) / 1000)}s`
      )
    },
    onExtractError: (row, error) => console.error(`extract failed ${row.post.id}: ${String(error).slice(0, 200)}`),
    onEmulateError: (mention, error) =>
      console.error(`failed ${mention.store} ${mention.row.post.id}: ${String(error).slice(0, 200)}`)
  })
  await writeGapEvents(resolve(dir, 'gap-events.json'), {
    generatedAt: dayjs().toISOString(),
    verify: model ? { model, threshold } : null,
    processed: result.processed,
    events: result.events
  })
  const { extract, emulate: progress } = result
  const tokens = {
    input: (extract ? extract.inputTokens : 0) + progress.inputTokens,
    output: (extract ? extract.outputTokens : 0) + progress.outputTokens
  }
  const cost = (tokens.input * 0.1 + tokens.output * 0.5) / 1e6
  console.log(
    `登録漏れ投稿 ${rows.length} 件 → イベント ${result.events.length} 件、イベントでないと判定 ${result.ignored} 件、未処理 ${rows.length - result.processed.length} 件（抽出できず ${result.unextracted} / 照合に失敗 ${progress.failed}）`
  )
  console.log(
    `calls=${progress.calls} (cached ${progress.cachedCalls}) verified=${progress.verified} merged=${progress.merged} verifyFailed=${progress.verifyFailed} tokens in=${tokens.input} out=${tokens.output} est=$${cost.toFixed(2)}`
  )
}

/** 1 以上の整数のオプション。未指定なら fallback */
const positiveInteger = (name: string, raw: string | undefined, fallback: number) => {
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer: ${raw}`)
  return value
}

const clef = async () => {
  const parsedModel = ClefModelSchema.safeParse(values.model)
  if (!parsedModel.success) throw new Error(`unknown --model: ${values.model} (clef or clef-flash)`)
  const model = parsedModel.data
  const concurrency = positiveInteger('--concurrency', values.concurrency, 8)
  const limit = positiveInteger('--limit', values.limit, Number.POSITIVE_INFINITY)
  const before = values.before ? Date.parse(values.before) : Number.POSITIVE_INFINITY
  const since = values.since ? Date.parse(values.since) : Number.NEGATIVE_INFINITY
  if (Number.isNaN(before) || Number.isNaN(since)) throw new Error('--before / --since must be ISO timestamps')
  const [posts, gold, accounts, characterNames, storeNames] = await Promise.all([
    readPosts(paths.posts),
    readGold(paths.gold),
    readStoreAccounts(paths.characters),
    readCharacterNames(paths.characters),
    readStoreNames(paths.characters)
  ])
  const analysis = analyze({ posts, events: gold.events, accounts, characterNames })
  const representatives = await readRepresentativePosts(dir)
  const inRange = representatives.targets.filter((target) => since <= target.time && target.time < before)
  // 分析に無い投稿を外してから件数を絞る（試運転の --limit が実際に呼ぶ件数になる）
  const { rows, skipped } = resolveTargets(inRange, analysis)
  const targets = rows.slice(0, limit).map((item) => item.target)
  const cacheDir = resolve(dir, 'clef', QUESTION_VERSION)
  const limited = targets.length < rows.length ? ` of ${rows.length}` : ''
  console.log(
    `events=${representatives.events} posts=${inRange.length} targets=${targets.length}${limited} (skipped=${skipped}) model=${model} concurrency=${concurrency} cache=${cacheDir}`
  )
  const started = performance.now()
  const result = await runClefEvents({
    targets,
    model,
    analysis,
    accounts,
    storeNames,
    concurrency,
    endpoint: values.endpoint,
    cacheDir,
    onProgress: (progress) => {
      if (progress.done % 100 !== 0 && progress.done !== progress.total) return
      const called = progress.done - progress.cached
      const rate = called / ((performance.now() - started) / 1000)
      const eta = rate > 0 ? Math.round((progress.total - progress.done) / rate / 60) : 0
      console.log(
        `${dayjs().format('HH:mm:ss')} ${progress.done}/${progress.total} cached=${progress.cached} failed=${progress.failed} tokens=${progress.inputTokens} est=$${clefCost(model, progress.inputTokens).toFixed(2)} rate=${rate.toFixed(2)}/s eta=${eta}min`
      )
    },
    onError: (target, error) => console.error(`failed ${target.postId}: ${String(error).slice(0, 200)}`)
  })
  console.log(
    `done ${result.done}/${result.total} cached=${result.cached} failed=${result.failed} tokens in=${result.inputTokens} est=$${clefCost(model, result.inputTokens).toFixed(2)} (input $${CLEF_PRICE_PER_MILLION[model]} per 1M)`
  )
  // 保存済みから読んだ分も含め、判定できた全対象の is_event の確率
  const histogram = probabilityHistogram(result.probabilities.values())
  const peak = Math.max(1, ...histogram)
  console.log(`\nis_event probability (n=${result.probabilities.size}):`)
  for (const [index, count] of histogram.entries())
    console.log(
      `  ${(index / 10).toFixed(1)}-${((index + 1) / 10).toFixed(1)} ${String(count).padStart(5)} ${'#'.repeat(Math.round((count / peak) * 40))}`
    )
  // 失敗した投稿があれば異常終了にする（出力を取りこぼさないよう process.exit は使わない）
  if (result.failed > 0) process.exitCode = 1
}

/** seed --fix: 自動作成分の参考 URL・終了日・配布数を今の規則で直す。--apply のときだけ書く */
const seedFix = async () => {
  const fromReports = values['from-report']
  const options = {
    dir,
    cacheRoot: resolve(root, '.cache'),
    dbPath: resolve(values.db),
    charactersPath: paths.characters,
    // 書くのは --apply のときだけ。--dry-run と両方なら dry-run
    apply: values.apply && !values['dry-run'],
    reports:
      fromReports === undefined || fromReports.length === 0
        ? [resolve(dir, 'seed-report-applied.json'), resolve(dir, 'seed-report-applied-allyears.json')]
        : fromReports.map((path) => resolve(path)),
    reportPath: resolve(values.report === undefined ? resolve(dir, 'seed-fix-report.json') : values.report),
    ...(values['acsta-sql'] === undefined ? {} : { acstaSqlPath: resolve(values['acsta-sql']) }),
    now: dayjs().toISOString()
  }
  const run = await runFix(options)
  console.log(describeFix(options, run).join('\n'))
}

const seed = async () => {
  if (values.fix) return seedFix()
  const threshold = Number(values['clef-threshold'])
  if (!(threshold >= 0 && threshold <= 1)) throw new Error(`--clef-threshold must be a number in 0..1: ${values['clef-threshold']}`)
  const limit = values.limit === undefined ? undefined : positiveInteger('--limit', values.limit, 1)
  // 既定は 2023-01-01 以降。--all-years は既定の下限だけを外す（明示した --since / --before はそのまま効く）
  const since =
    values.since === undefined ? (values['all-years'] ? undefined : DEFAULT_SEED_SINCE) : assertDay('--since', values.since)
  const before = values.before === undefined ? undefined : assertDay('--before', values.before)
  const titles = values.titles
  if (titles !== 'llm' && titles !== 'rule') throw new Error(`--titles must be llm or rule: ${values.titles}`)
  const options = {
    dir,
    cacheRoot: resolve(root, '.cache'),
    charactersPath: paths.characters,
    dbPath: resolve(values.db),
    // 書くのは --apply のときだけ。--dry-run と両方なら dry-run
    apply: values.apply && !values['dry-run'],
    threshold,
    ...(since === undefined ? {} : { since }),
    ...(before === undefined ? {} : { before }),
    force: values.force,
    ...(limit === undefined ? {} : { limit }),
    reportPath: resolve(values.report === undefined ? resolve(dir, 'seed-report.json') : values.report),
    now: dayjs().toISOString(),
    titles,
    concurrency: positiveInteger('--concurrency', values.concurrency, DEFAULT_TITLE_CONCURRENCY),
    onTitleProgress: (progress: TitleProgress) => {
      if (progress.done % 25 !== 0 && progress.done !== progress.total) return
      console.log(
        `${dayjs().format('HH:mm:ss')} title ${progress.done}/${progress.total} cached=${progress.cached} called=${progress.called} failed=${progress.failed} 429=${progress.stats.rateLimited} 5xx=${progress.stats.serverErrors} invalid=${progress.stats.invalid} tokens=${progress.inputTokens}/${progress.outputTokens}`
      )
    },
    onTitleError: (target: TitleTarget, error: unknown) =>
      console.error(`title failed ${target.key}: ${String(error).slice(0, 200)}`)
  }
  const run = await runSeed(options)
  console.log(describeSeed(options, run).join('\n'))
}

// 親が子に渡す印。この変数がある起動は子なので、二度と子を起動しない。
// import.meta.hot では判定できない（bun --hot の配下でもこのエントリは HTML ではないため undefined のまま）。
// 判定に使うと子がさらに子を起動し続けて増殖したので、必ず環境変数で見分ける。
const HOT_CHILD_ENV = 'EVENT_DETECT_HOT'

/**
 * bun --hot で serve を動かし直す親。bun run event-detect serve はここで子（bun --hot）を 1 回だけ起動して待つので、
 * 呼び出し方を変えずにソースの書き換えが反映される。
 */
const serveHot = async () => {
  const child = Bun.spawn([process.execPath, '--hot', ...process.argv.slice(1)], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, [HOT_CHILD_ENV]: '1' }
  })
  // Ctrl-C は端末が子にも届ける。kill で親だけが止まったときに子が残らないよう転送する
  for (const signal of ['SIGTERM', 'SIGHUP'] as const) process.on(signal, () => child.kill(signal))
  process.exit(await child.exited)
}

const serve = async () => {
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be an integer in 1..65535')
  // 印が無いときだけ親として子を起動する。印がある（= 子）なら何があっても起動せず、下で待ち受けるだけ
  if (!(HOT_CHILD_ENV in process.env)) return serveHot()
  // 外部に公開しない（127.0.0.1 のみ）。ラベルの書き戻しは loadViewerApi が dir/labels.json に行う。
  // 再読み込みでは同じポートの待ち受けにハンドラだけが差し替わる。読み込み済みのデータは捨て、次のリクエストで読み直す。
  // prepare がデータを書き換えたときも、ハンドラが次のリクエストで気づいて読み直す
  Bun.serve({
    hostname: '127.0.0.1',
    port,
    fetch: createViewerHandler({
      dir,
      loadApi: () => loadViewerApi({ dir, charactersPath: paths.characters, now: () => dayjs().toISOString() }),
      onReload: () => console.log(`${dayjs().format('HH:mm:ss')} data changed, reloading ${dir}`)
    })
  })
  console.log(`listening on http://127.0.0.1:${port} (data: ${dir})`)
}

if (values.help || positionals.length !== 1) console.log(help)
else if (positionals[0] === 'prepare') await prepare()
else if (positionals[0] === 'report') await report()
else if (positionals[0] === 'eval') await evaluate()
else if (positionals[0] === 'judge') await judge()
else if (positionals[0] === 'extract') await extract()
else if (positionals[0] === 'emulate') await emulate()
else if (positionals[0] === 'gaps') await gaps()
else if (positionals[0] === 'clef') await clef()
else if (positionals[0] === 'seed') await seed()
else if (positionals[0] === 'serve') await serve()
else console.log(help)
