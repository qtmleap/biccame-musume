/**
 * X の x-client-transaction-id 生成が X 側の変更で壊れていないかを、受動的な観測だけで確かめる。
 *
 * ログアウト状態の https://x.com/ を Chromium で開くと、X 自身のクライアントが署名付きリクエストを数件送る。
 * その ID を自前実装（packages/shared/src/x/transaction）で再計算できるかを突き合わせる。
 * 署名モジュールの取得にはプロダクションと同じ fetchOnDemandFileText を使うので、探索が壊れたこともここで分かる。
 * 自分からは署名付きリクエストを一切送らない。Cookie や認証情報も使わない。
 *
 * ローカルでの実行例（.env は読み込まない）:
 *   CHROME_PATH=/path/to/chrome bun --no-env-file scripts/check-x-signer-drift.ts --report /tmp/report.md
 *   CHROME_PATH を省くと、Playwright が管理するフル版の Chromium を channel: 'chromium' で使う。
 *   既定の chromium headless shell は x.com にトップページを 403 で返されるため使わない。
 *
 * 終了コード:
 *   0: 1件以上を観測し、全件が一致した。
 *   1: ずれを検知した。1件でも不一致、または署名モジュールの探索や ClientTransaction.create が失敗した。
 *   2: 判定できなかった。トップページの取得失敗、署名付きリクエストが1件も観測できない、ブラウザが起動しない、など。
 *
 * 判定の優先順位は「HTML が無い、または署名付きリクエストが0件なら 2」が先で、そのあとに探索や create の失敗(1)を見る。
 * 署名付き通信が1件も出ないページ（ブロック・チャレンジ画面など）では、探索の失敗をずれとは断定できないため。
 */
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { fetchOnDemandFileText } from '@biccame/shared/x/transaction'
import { DEFAULT_USER_AGENT } from '@biccame/shared/x/transaction/discovery'
import { chromium, type Page } from '@playwright/test'
import { checkSignerDrift, type DriftCheckResult, type ObservedRequest, SignerInputsError } from './lib/x-signer-drift'

const HOME_URL = 'https://x.com/'
const TARGET_COUNT = 3
const TIMEOUT_MS = 30_000
const MESSAGE_LIMIT = 200

type ExitCode = 0 | 1 | 2
type Verdict = 'ok' | 'drift' | 'indeterminate'

type Outcome = {
  exitCode: ExitCode
  verdict: Verdict
  /** 判定理由を1行で。 */
  reason: string
  observedCount: number
  results: DriftCheckResult[]
  error?: { kind: string; message: string }
}

type Observation = { homePageHtml: string | undefined; homeStatus: string; observed: ObservedRequest[] }

const shortMessage = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n')[0].slice(0, MESSAGE_LIMIT)
}

const errorInfo = (kind: string, error: unknown) => ({ kind, message: shortMessage(error) })

/** 署名付きリクエストが目標数に達するか、時間切れになるまで集める。 */
const collectSigned = (page: Page) => {
  const observed: ObservedRequest[] = []
  const done = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TIMEOUT_MS)
    page.on('request', (request) => {
      const transactionId = request.headers()['x-client-transaction-id']
      if (!transactionId) return
      observed.push({ method: request.method(), url: request.url(), transactionId })
      if (observed.length >= TARGET_COUNT) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  return { observed, done }
}

const observe = async (): Promise<Observation> => {
  const chromePath = process.env.CHROME_PATH
  // 既定の chromium headless shell だと x.com がトップページに 403 を返すので、
  // CHROME_PATH が無いときはフル版の Chromium(新しい headless モード)を channel 指定で使う。
  const browser = await chromium.launch(
    chromePath === undefined || chromePath === '' ? { channel: 'chromium' } : { executablePath: chromePath }
  )
  try {
    const context = await browser.newContext({ locale: 'en-US', userAgent: DEFAULT_USER_AGENT })
    const page = await context.newPage()
    const home: { html: string | undefined; status: string } = { html: undefined, status: 'not requested' }
    await page.route(HOME_URL, async (route) => {
      try {
        const response = await route.fetch()
        const body = await response.text()
        home.status = `HTTP ${response.status()}`
        // 最後に取得できたものを採用する。成功以外の応答は署名材料として使えない。
        home.html = response.ok() ? body : undefined
        await route.fulfill({ response, body })
      } catch (error) {
        home.status = `fetch failed: ${shortMessage(error)}`
        await route.abort().catch(() => {})
      }
    })
    const { observed, done } = collectSigned(page)
    const navigated = await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }).then(
      () => true,
      (error: unknown) => {
        home.status = `${home.status}; navigation failed: ${shortMessage(error)}`
        return false
      }
    )
    if (navigated) await done
    return { homePageHtml: home.html, homeStatus: home.status, observed }
  } finally {
    await browser.close()
  }
}

const indeterminate = (reason: string, observedCount: number, error?: Outcome['error']): Outcome => ({
  exitCode: 2,
  verdict: 'indeterminate',
  reason,
  observedCount,
  results: [],
  error
})

const drift = (
  reason: string,
  observedCount: number,
  results: DriftCheckResult[],
  error?: Outcome['error']
): Outcome => ({
  exitCode: 1,
  verdict: 'drift',
  reason,
  observedCount,
  results,
  error
})

/** 取得済みの観測結果を判定する。ここから先は X への通信は署名モジュールの取得だけ。 */
const evaluate = async (observation: Observation): Promise<Outcome> => {
  const { homePageHtml, homeStatus, observed } = observation
  if (homePageHtml === undefined) {
    return indeterminate(`The home page could not be captured (${homeStatus})`, observed.length)
  }
  if (observed.length === 0) {
    return indeterminate('No signed request was observed on the logged-out home page', 0)
  }

  const signer = await fetchOnDemandFileText(homePageHtml).then(
    (text) => ({ text }),
    (error: unknown) => ({ error })
  )
  if ('error' in signer) {
    return drift('Signer module discovery failed', observed.length, [], errorInfo('discovery_failed', signer.error))
  }

  try {
    const results = await checkSignerDrift({
      observed,
      homePageHtml,
      ondemandFileText: signer.text
    })
    const mismatched = results.filter((result) => result.verdict !== 'match').length
    return mismatched === 0
      ? {
          exitCode: 0,
          verdict: 'ok',
          reason: 'All observed IDs were reproduced',
          observedCount: observed.length,
          results
        }
      : drift(`${mismatched} of ${results.length} observed IDs were not reproduced`, observed.length, results)
  } catch (error) {
    if (error instanceof SignerInputsError) {
      return drift('ClientTransaction.create failed', observed.length, [], errorInfo('create_failed', error))
    }
    throw error
  }
}

const renderReport = (outcome: Outcome): string => {
  const rows = outcome.results.map(
    (result, index) =>
      `| ${index + 1} | ${result.host} | ${result.path} | ${result.method} | ${result.verdict} | \`${result.transactionId}\` |`
  )
  return [
    '# X signer drift check',
    '',
    `- Result: ${outcome.verdict}`,
    `- Exit code: ${outcome.exitCode}`,
    `- Reason: ${outcome.reason}`,
    `- Observed signed requests: ${outcome.observedCount}`,
    '',
    ...(rows.length > 0
      ? [
          '## Requests',
          '',
          '| # | Host | Path | Method | Result | Transaction ID |',
          '| --- | --- | --- | --- | --- | --- |',
          ...rows,
          ''
        ]
      : []),
    ...(outcome.error
      ? ['## Error', '', `- Kind: ${outcome.error.kind}`, `- Message: ${outcome.error.message}`, '']
      : [])
  ].join('\n')
}

const parseReportPath = (): string | undefined => {
  try {
    return parseArgs({ args: process.argv.slice(2), options: { report: { type: 'string' } } }).values.report
  } catch (error) {
    console.error(`Invalid arguments: ${shortMessage(error)}`)
    return process.exit(2)
  }
}

const reportPath = parseReportPath()

// 想定外の例外（Bun の未捕捉例外は終了コード 1 になりずれと区別できない）はすべてここで 2 に寄せる。
const outcome = await observe()
  .then(evaluate)
  .catch((error: unknown) => indeterminate('The check could not be completed', 0, errorInfo('unexpected_error', error)))

console.log(`[x-signer-drift] ${outcome.verdict}: ${outcome.reason} (observed=${outcome.observedCount})`)
for (const result of outcome.results) {
  console.log(`[x-signer-drift] ${result.verdict} ${result.method} ${result.host}${result.path}`)
}
if (outcome.error) console.error(`[x-signer-drift] ${outcome.error.kind}: ${outcome.error.message}`)
if (reportPath !== undefined) {
  await writeFile(reportPath, renderReport(outcome)).catch((error: unknown) => {
    console.error(`[x-signer-drift] Failed to write the report: ${shortMessage(error)}`)
  })
}
process.exit(outcome.exitCode)
