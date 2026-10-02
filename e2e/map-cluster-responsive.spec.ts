import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
  )
  await page.goto('/location/')
  await expect(page.getByTestId('marker')).not.toHaveCount(0)
})
test('national map combines overlapping stores into readable count markers', async ({ page }) => {
  await expect(page.getByRole('button', { name: '3店舗を拡大' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '地域' })).toBeVisible()
  await expect(page.getByRole('button', { name: '全店舗を表示' })).toBeVisible()
})

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const widths = [320, 375, 430, 768, 1024, 1280, 1440]
for (const width of widths)
  for (const theme of ['light', 'dark']) {
    test(`capture ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/location/')
      await expect(page.getByTestId('marker')).not.toHaveCount(0)
      await page.clock.install({ time: Date.parse('2026-10-02T12:00:00Z') })
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.style.colorScheme = theme
      }, theme)
      const evidence = await page.evaluate(
        async ({ theme }) => {
          const families = ['Noto Sans JP', 'Zen Maru Gothic', 'M PLUS 1 Code']
          await Promise.all(
            families.flatMap((family) =>
              [400, 500, 700].map((weight) => document.fonts.load(`${weight} 16px "${family}"`, '店舗 ABC'))
            )
          )
          await document.fonts.ready
          const fonts = families.flatMap((family) =>
            [400, 500, 700].map((weight) => ({
              family,
              weight,
              loaded: document.fonts.check(`${weight} 16px "${family}"`, '店舗 ABC'),
              registered: Array.from(document.fonts).some(
                (face) =>
                  face.family.replaceAll('"', '') === family &&
                  face.weight === String(weight) &&
                  face.status === 'loaded'
              )
            }))
          )
          const colors = (element: Element) => {
            const s = getComputedStyle(element)
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = s.backgroundColor
            ctx.fillRect(0, 0, 1, 1)
            const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
            return { background: s.backgroundColor, rgb, color: s.color, font: s.fontFamily }
          }
          const opacities = () =>
            Array.from(document.querySelectorAll('header, section, [data-testid="map"], [data-testid="marker"]')).map(
              (el) => ({ tag: el.tagName, opacity: getComputedStyle(el).opacity })
            )
          const rectangle = (element: Element) => {
            const r = element.getBoundingClientRect()
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
          }
          const headerElement = document.querySelector('header')!
          const mapElement = document.querySelector('[data-testid="map"]')!
          const logo = headerElement.querySelector('a')!
          const logoRect = logo.getBoundingClientRect()
          const hit = document.elementFromPoint(logoRect.left + logoRect.width / 2, logoRect.top + logoRect.height / 2)
          const listTrigger = Array.from(document.querySelectorAll('button')).find(
            (el) => el.textContent?.trim() === '店舗一覧'
          )!
          const triggerRect = listTrigger.getBoundingClientRect()
          const triggerHit = document.elementFromPoint(
            triggerRect.left + triggerRect.width / 2,
            triggerRect.top + triggerRect.height / 2
          )
          const colorsForRGB = (color: string) => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
          }
          const components = Array.from(
            document.querySelectorAll(
              'select[aria-label="地域"], button[title$="店舗を拡大"] > span, section[aria-label="店舗一覧"] h2'
            )
          ).map((el) => {
            const s = getComputedStyle(el)
            return {
              name: el.getAttribute('aria-label') || el.textContent,
              color: colorsForRGB(s.color),
              background: colorsForRGB(
                s.backgroundColor === 'rgba(0, 0, 0, 0)'
                  ? getComputedStyle(el.closest('[aria-label="店舗一覧"]')!).backgroundColor
                  : s.backgroundColor
              ),
              box: rectangle(el)
            }
          })
          const boxes = {
            header: rectangle(headerElement),
            map: rectangle(mapElement),
            logoHit: logo.contains(hit),
            listHit: listTrigger.contains(triggerHit),
            mapParentPosition: getComputedStyle(mapElement.parentElement!).position
          }
          const pre = opacities()
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
          return {
            orderedIDs: JSON.parse(document.getElementById('root')!.dataset.fixtureIds || '[]'),
            boxes,
            components,
            theme,
            dark: document.documentElement.classList.contains('dark'),
            fonts,
            body: colors(document.body),
            header: colors(document.querySelector('header')!),
            map: colors(document.querySelector('[data-testid="map"]')!),
            computedFamily: getComputedStyle(document.body).fontFamily,
            preOpacity: pre,
            postOpacity: opacities(),
            positions: Array.from(document.querySelectorAll('[data-testid="marker"]')).map((el) =>
              el.getAttribute('data-position')
            ),
            seed: 'no randomness',
            sort: 'fixture insertion / geographic distance list'
          }
        },
        { theme }
      )
      expect(evidence.orderedIDs).toEqual([
        'tokyo-a',
        'tokyo-b',
        'tokyo-c',
        'osaka-a',
        'osaka-b',
        'sapporo',
        'fukuoka',
        'missing'
      ])
      expect(evidence.dark).toBe(theme === 'dark')
      expect(evidence.fonts.every((f) => f.loaded && f.registered)).toBe(true)
      expect(evidence.computedFamily).toContain('Zen Maru Gothic')
      expect(evidence.body.rgb).toEqual(theme === 'dark' ? [9, 9, 11] : [252, 231, 243])
      expect(evidence.postOpacity.every((el) => el.opacity === '1')).toBe(true)
      expect(evidence.boxes.header.height).toBeGreaterThanOrEqual(width < 768 ? 48 : 56)
      expect(evidence.boxes.map.width).toBe(width)
      expect(evidence.boxes.map.height).toBeGreaterThan(600)
      expect(evidence.boxes.map.top).toBeGreaterThanOrEqual(evidence.boxes.header.bottom)
      expect(evidence.boxes.mapParentPosition).toBe('relative')
      expect(evidence.boxes.logoHit).toBe(true)
      expect(evidence.boxes.listHit).toBe(true)
      expect(evidence.map.rgb).toEqual(theme === 'dark' ? [39, 39, 42] : [244, 244, 245])
      const luminance = (rgb: number[]) =>
        rgb
          .map((v) => {
            const c = v / 255
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          })
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
      for (const component of evidence.components) {
        const a = luminance(component.color),
          b = luminance(component.background)
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
        expect(component.box.width).toBeGreaterThan(40)
      }
      const mode = process.env.B06_CAPTURE === 'before' ? 'before' : 'after'
      const dir = `.cache/b06/${mode}`
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: `${dir}/${width}-${theme}.png` })
      writeFileSync(
        `${dir}/${width}-${theme}.json`,
        JSON.stringify(
          {
            ...evidence,
            width,
            specSHA: createHash('sha256').update(readFileSync('e2e/map-cluster-responsive.spec.ts')).digest('hex'),
            source: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
            routeSHA: createHash('sha256')
              .update(
                readFileSync(mode === 'before' ? '.cache/b06/base-location.tsx' : 'src/app/routes/location/index.tsx')
              )
              .digest('hex'),
            baseline: mode === 'before' ? 'e597885f26769570a8588709db4c51e43e603a2b' : undefined
          },
          null,
          2
        )
      )
    })
  }

const geometry = async (page: import('@playwright/test').Page) =>
  JSON.parse((await page.getByTestId('map-geometry').textContent()) || '{}')
const camera = async (page: import('@playwright/test').Page) =>
  JSON.parse((await page.getByTestId('map-state').textContent()) || '{}')
for (const width of widths)
  test(`region cluster selection and measured camera at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/location/')
    await expect(page.getByTestId('marker')).not.toHaveCount(0)
    await page.getByRole('combobox', { name: '地域' }).selectOption('kanto')
    await expect
      .poll(async () => (await geometry(page)).bounds)
      .toEqual({ south: 35.68, north: 35.681, west: 139.76, east: 139.762 })
    const regional = await geometry(page)
    expect(regional.padding.top).toBeGreaterThan(70)
    if (width >= 768) expect(regional.padding.left).toBeGreaterThan(300)
    else expect(regional.padding.left).toBe(24)
    // High zoom naturally separates stores; the list also selects coincident/overlapping markers.
    await expect(page.getByRole('button', { name: '東京店舗Aを選択', exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: '全店舗を表示' }).click()
    await expect
      .poll(async () => (await geometry(page)).bounds)
      .toEqual({ south: 33.59, north: 43.06, west: 130.4, east: 141.35 })
    const cluster = page.getByRole('button', { name: '3店舗を拡大', exact: true })
    await cluster.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThanOrEqual(16)
    await expect(page.getByRole('button', { name: '東京店舗Aを選択', exact: true })).toHaveCount(1)
    const list = page.getByRole('button', { name: '店舗一覧', exact: true })
    if ((await list.getAttribute('aria-expanded')) !== 'true') await list.click()
    await page
      .getByRole('button', { name: /東京店舗A/ })
      .filter({ has: page.locator('h3') })
      .click()
    await expect(page.getByRole('link', { name: /東京店舗A/ })).toBeVisible()
    await expect.poll(async () => (await camera(page)).zoom).toBe(17)
    await expect.poll(async () => (await geometry(page)).offset.y).toBeGreaterThan(0)
    const first = await geometry(page)
    await page.getByRole('button', { name: '東京店舗Aを選択', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await geometry(page)).offset).toEqual(first.offset)
    // The selected pin must be outside the actual controls/card and header rectangles.
    const visible = await page.evaluate(() => {
      const marker = document.querySelector('[title="東京店舗Aを選択"]')!.getBoundingClientRect()
      const header = document.querySelector('header')!.getBoundingClientRect()
      const card = document.querySelector('a[href="/characters/tokyo-a"]')!.getBoundingClientRect()
      const controls = document.querySelector('select[aria-label="地域"]')!.closest('div')!.getBoundingClientRect()
      return {
        markerTop: marker.top,
        markerBottom: marker.bottom,
        headerBottom: header.bottom,
        cardTop: card.top,
        controlsBottom: controls.bottom
      }
    })
    expect(visible.markerTop).toBeGreaterThan(visible.headerBottom)
    expect(visible.markerTop).toBeGreaterThan(visible.controlsBottom)
    expect(visible.markerBottom).toBeLessThan(visible.cardTop)
    // Opening a Sheet/panel moves the selected pin into remaining map space, and closing resets it.
    await list.click()
    await expect
      .poll(async () => (width >= 768 ? (await geometry(page)).offset.x : (await geometry(page)).offset.y))
      .toEqual(width >= 768 ? (24 - 328) / 2 : expect.any(Number))
    const open = await geometry(page)
    if (width < 768) expect(open.offset.y).toBeGreaterThan(first.offset.y)
    await page.getByRole('button', { name: '店舗一覧を閉じる' }).click()
    await expect.poll(async () => (await geometry(page)).offset).toEqual(first.offset)
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(async () => (await geometry(page)).offset).toEqual(first.offset)
    await list.click()
    await expect
      .poll(async () => (width >= 768 ? (await geometry(page)).offset.x : (await geometry(page)).offset.y))
      .toEqual(width >= 768 ? -152 : expect.any(Number))
    const previous = await camera(page)
    await page.getByRole('button', { name: /位置未登録店舗/ }).click()
    await expect(page.getByRole('link', { name: /位置未登録店舗/ })).toContainText('地図位置未登録')
    expect(await camera(page)).toEqual(previous)
  })

test('production animated Sheet updates bounds and selected camera after settlement', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/location/')
  await expect(page.getByRole('button', { name: '3店舗を拡大', exact: true })).toBeVisible()
  // Restore real CSS animations only for this behavior assertion, keeping capture controls intact.
  const removed = await page.evaluate(() => {
    const visit = (rules: CSSRuleList): number =>
      Array.from(rules).reduce((count, rule) => {
        if (rule instanceof CSSStyleRule && rule.style.getPropertyValue('animation').includes('none')) {
          rule.style.removeProperty('animation')
          rule.style.removeProperty('transition')
          return count + 1
        }
        return count + ('cssRules' in rule && rule.cssRules instanceof CSSRuleList ? visit(rule.cssRules) : 0)
      }, 0)
    return Array.from(document.styleSheets).reduce((count, sheet) => count + visit(sheet.cssRules), 0)
  })
  expect(removed).toBeGreaterThan(0)
  const settle = async (label: string) => {
    const result = await page.locator('[data-slot=sheet-content]').evaluate(async (element, label) => {
      const style = getComputedStyle(element)
      const initial = { transform: style.transform, animation: style.animationName, duration: style.animationDuration }
      const animations = element.getAnimations()
      const states = animations.map((animation) => ({
        playState: animation.playState,
        duration: animation.effect?.getTiming().duration
      }))
      await Promise.all(animations.map((animation) => animation.finished))
      const map = document.querySelector('[data-testid=map]')
      if (!map) throw new Error('Map fixture missing')
      const mapBox = map.getBoundingClientRect()
      const sheetBox = element.getBoundingClientRect()
      return {
        label,
        initial,
        states,
        finalTransform: getComputedStyle(element).transform,
        height: sheetBox.height,
        expectedBottom: mapBox.bottom - sheetBox.top + 24
      }
    }, label)
    expect(result.initial.animation).toBe('enter')
    expect(result.initial.duration).toBe('0.5s')
    expect(result.initial.transform).not.toBe('none')
    expect(result.states.some((state) => state.playState === 'running' && state.duration === 500)).toBe(true)
    expect(result.finalTransform).toBe('none')
    expect(result.height).toBeGreaterThan(300)
    return result
  }
  await page.getByRole('button', { name: '店舗一覧', exact: true }).click()
  const opening = await settle('opening')
  writeFileSync(
    '.cache/b06/animated-sheet-opening.json',
    JSON.stringify({ removed, opening, geometry: await geometry(page) }, null, 2)
  )
  await expect.poll(async () => (await geometry(page)).padding.bottom).toBe(opening.expectedBottom)
  const evidence = [{ ...opening, geometry: await geometry(page) }]
  // Nonmodal controls remain usable outside the settled Sheet.
  await page.getByRole('combobox', { name: '地域' }).focus()
  await expect(page.getByRole('combobox', { name: '地域' })).toBeFocused()
  await page.getByRole('button', { name: '全店舗を表示', exact: true }).click()
  await expect.poll(async () => (await geometry(page)).padding.bottom).toBe(opening.expectedBottom)
  await page.getByRole('button', { name: '店舗一覧を閉じる' }).click()
  await expect(page.locator('[data-slot=sheet-content]')).toHaveCount(0)
  await expect.poll(async () => (await geometry(page)).padding.bottom).toBe(24)
  // A new opening after exit must recompute bounds again.
  await page.getByRole('button', { name: '店舗一覧', exact: true }).click()
  const repeated = await settle('repeated opening')
  await expect.poll(async () => (await geometry(page)).padding.bottom).toBe(repeated.expectedBottom)
  evidence.push({ ...repeated, geometry: await geometry(page) })
  await page
    .getByRole('button', { name: /東京店舗A/ })
    .filter({ has: page.locator('h3') })
    .click()
  await expect(page.locator('[data-slot=sheet-content]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /東京店舗A/ })).toBeVisible()
  const closedOffset = (await geometry(page)).offset
  await page.getByRole('button', { name: '店舗一覧', exact: true }).click()
  const selected = await settle('selected opening')
  const topPadding = await page.getByTestId('map').evaluate((element) => {
    const controls = document.querySelector('select[aria-label="地域"]')?.closest('div')
    if (!controls) throw new Error('Region toolbar fixture missing')
    return controls.getBoundingClientRect().bottom - element.getBoundingClientRect().top + 24
  })
  const selectedOffset = { x: 0, y: (selected.expectedBottom - topPadding) / 2 }
  await expect.poll(async () => (await geometry(page)).offset).toEqual(selectedOffset)
  evidence.push({ ...selected, geometry: await geometry(page) })
  // Resize uses current physical Sheet height, not its earlier animation position.
  await page.setViewportSize({ width: 320, height: 1000 })
  await expect
    .poll(async () => page.getByTestId('map').evaluate((element) => element.getBoundingClientRect().bottom))
    .toBe(1000)
  const resizedBottom = await page.locator('[data-slot=sheet-content]').evaluate((element) => {
    const map = document.querySelector('[data-testid=map]')
    if (!map) throw new Error('Map fixture missing')
    return map.getBoundingClientRect().bottom - element.getBoundingClientRect().top + 24
  })
  await expect.poll(async () => (await geometry(page)).offset.y).toBe((resizedBottom - topPadding) / 2)
  await page.getByRole('button', { name: '店舗一覧を閉じる' }).click()
  await expect(page.locator('[data-slot=sheet-content]')).toHaveCount(0)
  await expect.poll(async () => (await geometry(page)).offset).toEqual(closedOffset)
  await page.getByRole('button', { name: '店舗一覧', exact: true }).click()
  const selectedRepeated = await settle('selected repeated opening')
  await expect
    .poll(async () => (await geometry(page)).offset.y)
    .toBe((selectedRepeated.expectedBottom - topPadding) / 2)
  evidence.push({ ...selectedRepeated, geometry: await geometry(page) })
  writeFileSync('.cache/b06/animated-sheet-green.json', JSON.stringify({ removed, evidence }, null, 2))
})
