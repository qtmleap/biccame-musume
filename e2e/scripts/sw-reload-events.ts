import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type ConsoleMessage, type Request, type Response } from 'playwright'

const URL = 'https://biccame-musume.com/events'
const RELOADS = Number(process.env.RELOADS ?? 20)

type FailedReq = {
  iter: number
  url: string
  failure: string | null
  resourceType: string
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pw-sw-'))
  console.log(`[setup] userDataDir=${userDataDir}`)

  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    serviceWorkers: 'allow',
    args: ['--no-sandbox']
  })
  const page = await ctx.newPage()

  const failures: FailedReq[] = []
  const consoleErrors: { iter: number; text: string }[] = []
  let currentIter = 0

  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') {
      consoleErrors.push({ iter: currentIter, text: m.text() })
    }
  })
  page.on('requestfailed', (r: Request) => {
    failures.push({
      iter: currentIter,
      url: r.url(),
      failure: r.failure()?.errorText ?? null,
      resourceType: r.resourceType()
    })
  })
  page.on('response', (resp: Response) => {
    const status = resp.status()
    if (status >= 400) {
      console.log(`  [resp ${status}] ${resp.url()}`)
    }
  })

  type IterResult = {
    iter: number
    ok: boolean
    docStatus: number | null
    docFromSW: boolean
    swController: string | null
    durationMs: number
    error?: string
  }
  const results: IterResult[] = []

  for (let i = 0; i < RELOADS; i++) {
    currentIter = i
    const t0 = Date.now()
    let docStatus: number | null = null
    let docFromSW = false
    const onDocResp = (resp: Response) => {
      if (resp.url() === URL || resp.url() === `${URL}/`) {
        docStatus = resp.status()
        const sw = resp.fromServiceWorker()
        if (sw) docFromSW = true
      }
    }
    page.on('response', onDocResp)
    let ok = true
    let error: string | undefined
    try {
      if (i === 0) {
        await page.goto(URL, { waitUntil: 'load', timeout: 20000 })
      } else {
        await page.reload({ waitUntil: 'load', timeout: 20000 })
      }
    } catch (e) {
      ok = false
      error = (e as Error).message
    }
    page.off('response', onDocResp)

    const swController = await page
      .evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
      .catch(() => null)

    results.push({
      iter: i,
      ok,
      docStatus,
      docFromSW,
      swController,
      durationMs: Date.now() - t0,
      error
    })

    console.log(
      `[iter ${i.toString().padStart(2, '0')}] ok=${ok} status=${docStatus} fromSW=${docFromSW} sw=${swController ? 'yes' : 'no'} ${results.at(-1)!.durationMs}ms${error ? ` err=${error}` : ''}`
    )

    if (!ok) {
      // Capture screenshot on failure
      const shot = `/tmp/sw-fail-${i}.png`
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
      console.log(`  screenshot: ${shot}`)
      // Try to capture page content
      const html = await page.content().catch(() => '')
      console.log(`  body snippet: ${html.slice(0, 300).replace(/\n/g, ' ')}`)
    }

    // small delay between reloads
    await page.waitForTimeout(500)
  }

  console.log('\n=== SUMMARY ===')
  const failedIters = results.filter((r) => !r.ok || (r.docStatus !== null && r.docStatus >= 400))
  console.log(`reloads: ${results.length}`)
  console.log(`failed iterations: ${failedIters.length}`)
  for (const f of failedIters) {
    console.log(`  iter ${f.iter}: status=${f.docStatus} err=${f.error}`)
  }
  console.log(`\nrequest failures: ${failures.length}`)
  for (const f of failures.slice(0, 30)) {
    console.log(`  [iter ${f.iter}] ${f.resourceType} ${f.failure}: ${f.url}`)
  }
  if (failures.length > 30) console.log(`  ... and ${failures.length - 30} more`)

  console.log(`\nconsole errors: ${consoleErrors.length}`)
  for (const e of consoleErrors.slice(0, 20)) {
    console.log(`  [iter ${e.iter}] ${e.text}`)
  }

  await ctx.close()
  rmSync(userDataDir, { recursive: true, force: true })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
