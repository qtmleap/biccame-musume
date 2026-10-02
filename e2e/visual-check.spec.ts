import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { paintEvidence, prepare, screens } from './local/support'
import { assertHealthyScreen } from './regression/guards'

const captureSpecHash = createHash('sha256')
  .update(readFileSync('e2e/visual-check.spec.ts'))
  .update(readFileSync('e2e/local/support.ts'))
  .update(readFileSync('e2e/local/main.tsx'))
  .update(readFileSync('e2e/local/vite.config.ts'))
  .update(readFileSync('playwright.config.ts'))
  .update(readFileSync('e2e/local/styles.css'))
  .update(readFileSync('e2e/local/fonts.css'))
  .digest('hex')
const captureHead = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
const candidates = process.env.A15_CANDIDATES === '1'
for (const [route, heading, role] of screens)
  for (const width of [375, 1280])
    for (const theme of ['light', 'dark'])
      test(`${route} ${width} ${theme}`, async ({ page }, info) => {
        await prepare(page, theme)
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`${route}?theme=${theme}`)
        await assertHealthyScreen(page, heading, role)
        const evidence = await paintEvidence(page, theme)
        const frames: Buffer[] = []
        await expect
          .poll(
            async () => {
              await paintEvidence(page, theme)
              const frame = await page.screenshot({ fullPage: true, animations: 'disabled' })
              frames.push(frame)
              return (
                frames.length >= 3 &&
                frames
                  .slice(-3)
                  .every(
                    (value) =>
                      createHash('sha256').update(value).digest('hex') ===
                      createHash('sha256').update(frame).digest('hex')
                  )
              )
            },
            { intervals: [250], timeout: 15000 }
          )
          .toBe(true)
        const name = `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-${width}-${theme}.png`
        if (candidates) {
          const dir = resolve('.cache/a15/candidates')
          await mkdir(dir, { recursive: true })
          const frame = frames.at(-1)
          if (!frame) throw new Error('Missing stable frame')
          await writeFile(resolve(dir, name), frame)
          const postEvidence = await paintEvidence(page, theme)
          await expect(page).toHaveScreenshot(name, { fullPage: true, animations: 'disabled' })
          await writeFile(
            resolve(dir, name.replace('.png', '.json')),
            JSON.stringify(
              {
                status: 'PENDING HUMAN APPROVAL; same-run stability comparison only',
                ...evidence,
                postEvidence,
                test: info.title,
                actualURL: page.url(),
                viewport: page.viewportSize(),
                serviceWorkers: 'blocked',
                animations: 'disabled',
                clock: '2026-10-02T00:00:00Z',
                head: captureHead,
                captureSpecHash
              },
              null,
              2
            )
          )
        } else {
          await paintEvidence(page, theme)
          await expect(page).toHaveScreenshot(name, { fullPage: true, animations: 'disabled' })
        }
      })
