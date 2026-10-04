import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'

const opacity = async (page: Page) =>
  page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll(
        '[data-testid=production-page] h1,[data-testid=production-page] h3,[data-testid=production-page] button'
      )
    ].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    return targets.map((target) => {
      const ancestors: { tag: string; opacity: string }[] = []
      for (const element of [
        target,
        ...(() => {
          const parents: Element[] = []
          for (let parent = target.parentElement; parent; parent = parent.parentElement) parents.push(parent)
          return parents
        })()
      ])
        ancestors.push({ tag: element.tagName, opacity: getComputedStyle(element).opacity })
      return { label: target.textContent?.trim(), ancestors }
    })
  })
const proof = async (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('[data-testid=review-frame]')
    if (!frame) throw new Error('Missing actual story frame')
    const heading = document.querySelector<HTMLElement>(
      '[data-testid=production-page] h1, [data-testid=production-page] button'
    )
    if (!heading) throw new Error('Missing actual page content')
    const rgb = (css: string) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Missing native color conversion')
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const rgba = ctx.getImageData(0, 0, 1, 1).data
      return `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`
    }
    return {
      htmlTheme: document.documentElement.className,
      bodyCSS: getComputedStyle(document.body).backgroundColor,
      bodyRGB: rgb(getComputedStyle(document.body).backgroundColor),
      frameRGB: rgb(getComputedStyle(frame).backgroundColor),
      foregroundRGB: rgb(getComputedStyle(frame).color),
      orderedCharacterHrefs: [
        ...document.querySelectorAll('[data-testid=production-page] main a[href^="/characters/"]')
      ].map((link) => link.getAttribute('href')),
      frameBackground: getComputedStyle(frame).backgroundColor,
      frameColor: getComputedStyle(frame).color,
      fontFamily: getComputedStyle(frame).fontFamily,
      fontWeight: getComputedStyle(frame).fontWeight,
      headingFamily: getComputedStyle(heading).fontFamily,
      headingWeight: getComputedStyle(heading).fontWeight,
      fonts: ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'].flatMap((family) =>
        [400, 500, 700].map((weight) => ({
          family,
          weight,
          registered: [...document.fonts].some(
            (face) => face.family.replaceAll(/['"]/g, '') === family && face.weight === String(weight)
          ),
          loaded: [...document.fonts].some(
            (face) =>
              face.family.replaceAll(/['"]/g, '') === family &&
              face.weight === String(weight) &&
              face.status === 'loaded'
          ),
          checked: document.fonts.check(`${weight} 16px "${family}"`, '店舗検索ABC')
        }))
      )
    }
  })
for (const id of ['pages-production--characters', 'pages-production--calendar'])
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440])
    for (const theme of ['light', 'dark'])
      test(`visual ${id} ${width} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.route('**/*', (route) =>
          new URL(route.request().url()).origin === 'http://127.0.0.1:16006' ? route.continue() : route.abort()
        )
        await page.addInitScript(() => localStorage.setItem('biccame-sort-type', JSON.stringify('character_birthday')))
        await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`)
        await expect(page.getByTestId('production-page').locator('main')).toBeVisible()
        if (id.endsWith('characters')) await expect(page.getByRole('heading', { name: 'ビッカメ娘一覧' })).toBeVisible()
        else await expect(page.getByRole('button', { name: '2026年10月', exact: true })).toBeVisible()
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
        await page.evaluate(async () => {
          for (const family of ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code'])
            for (const weight of [400, 500, 700]) {
              const sample = document.createElement('span')
              sample.textContent = '店舗検索ABC'
              sample.setAttribute('aria-hidden', 'true')
              sample.style.cssText = `position:fixed;left:-10000px;top:0;font-family:"${family}";font-weight:${weight}`
              document.body.appendChild(sample)
              await document.fonts.load(`${weight} 16px "${family}"`, '店舗検索ABC')
            }
          await document.fonts.ready
        })
        await expect
          .poll(async () => {
            const first = await opacity(page)
            await page.waitForTimeout(100)
            return JSON.stringify(first) === JSON.stringify(await opacity(page))
          })
          .toBe(true)
        await page.evaluate(() =>
          Reflect.set(window, '__capturePageRoot', document.querySelector('[data-testid=production-page]'))
        )
        const before = await proof(page)
        const preOpacity = await opacity(page)
        expect(before.htmlTheme).toBe(theme === 'dark' ? 'dark' : '')
        if (id.endsWith('characters'))
          expect(before.orderedCharacterHrefs).toEqual([
            '/characters/abeno',
            '/characters/takatsuki',
            '/characters/kyoto'
          ])
        expect(before.fontFamily).toContain('Zen Maru Gothic')
        for (const face of before.fonts) {
          expect(face.registered).toBe(true)
          expect(face.loaded).toBe(true)
          expect(face.checked).toBe(true)
        }
        for (const target of preOpacity.filter(
          (target) => target.ancestors[0]?.tag === 'H1' || target.ancestors[0]?.tag === 'H3'
        ))
          for (const ancestor of target.ancestors)
            expect(Number(ancestor.opacity), `${target.label} ancestor ${ancestor.tag}`).toBeGreaterThan(0)
        const dir = '.storybook/.artifacts/visual'
        await mkdir(dir, { recursive: true })
        const filename = `${id}-${width}-${theme}`
        // Capture the current Chromium paint without Playwright's stylesheet/animation preparation.
        const session = await page.context().newCDPSession(page)
        const size = await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight
        }))
        const captured = await session.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
          clip: { x: 0, y: 0, ...size, scale: 1 }
        })
        await writeFile(`${dir}/${filename}.png`, Buffer.from(captured.data, 'base64'))
        await session.detach()
        await page.evaluate(async () => {
          await document.fonts.ready
        })
        const after = await proof(page)
        const postOpacity = await opacity(page)
        const identity = {
          specSHA256: createHash('sha256')
            .update(await readFile('.storybook/tests/catalogue-visual.spec.ts'))
            .digest('hex'),
          builtIndexSHA256: createHash('sha256')
            .update(await readFile('.storybook/.artifacts/build/index.json'))
            .digest('hex'),
          captureMethod: 'CDP Page.captureScreenshot viewport, unchanged viewport/DOM',
          fixedClock: '2026-10-02T03:00:00.000Z',
          randomValue: 0.5,
          sortMode: 'character_birthday',
          gitHEAD: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          story: id,
          width,
          theme
        }
        await writeFile(
          `${dir}/${filename}.json`,
          JSON.stringify(
            {
              identity,
              before,
              after,
              preOpacity,
              postOpacity,
              samePageRoot: await page.evaluate(
                () =>
                  Reflect.get(window, '__capturePageRoot') === document.querySelector('[data-testid=production-page]')
              ),
              scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth)
            },
            null,
            2
          )
        )
        expect(after).toEqual(before)
        expect(postOpacity).toEqual(preOpacity)
      })
