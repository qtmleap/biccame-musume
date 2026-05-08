import { chromium } from 'playwright'

const URL = 'https://dev.biccame-musume.com/events/503add7e-96ab-4172-8065-69e9caf68493'

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const failures: { url: string; failure: string | null; resourceType: string }[] = []
  const consoleMsgs: { type: string; text: string }[] = []
  const responses: { status: number; url: string }[] = []

  page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }))
  page.on('requestfailed', (r) =>
    failures.push({ url: r.url(), failure: r.failure()?.errorText ?? null, resourceType: r.resourceType() })
  )
  page.on('response', (r) => responses.push({ status: r.status(), url: r.url() }))

  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
  console.log(`doc status: ${resp?.status()}`)
  console.log(`title: ${await page.title()}`)

  await page.screenshot({ path: '/tmp/event-detail.png', fullPage: true })
  console.log('screenshot: /tmp/event-detail.png')

  const bodyText = await page.evaluate(() => document.body.innerText)
  console.log('--- body innerText (first 1000) ---')
  console.log(bodyText.slice(0, 1000))

  console.log('\n--- responses (status >= 300) ---')
  for (const r of responses.filter((x) => x.status >= 300)) {
    console.log(`  ${r.status} ${r.url}`)
  }

  console.log('\n--- failed requests ---')
  for (const f of failures) console.log(`  ${f.resourceType} ${f.failure}: ${f.url}`)

  console.log('\n--- console errors/warnings ---')
  for (const m of consoleMsgs.filter((m) => m.type === 'error' || m.type === 'warning')) {
    console.log(`  [${m.type}] ${m.text}`)
  }

  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
