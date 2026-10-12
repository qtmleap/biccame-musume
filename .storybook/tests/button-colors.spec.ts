import { expect, type Locator, type Page, test } from '@playwright/test'

const open = async (page: Page, id: string, dark: boolean, disabled = false) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&args=disabled:${disabled}${dark ? '&globals=theme:dark' : ''}`)
  await expect(page.getByTestId('review-frame')).not.toBeEmpty({ timeout: 20000 })
  await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^$/)
}

const expectBrand = async (button: Locator, hover = false) => {
  await expect(button).toBeVisible()
  await expect
    .poll(() =>
      button.evaluate((element, hovered) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = hovered ? 'color-mix(in oklab, var(--brand) 90%, transparent)' : 'var(--brand)'
        probe.style.color = 'var(--brand-foreground)'
        document.body.appendChild(probe)
        const expected = getComputedStyle(probe)
        const actual = getComputedStyle(element)
        const matches = actual.backgroundColor === expected.backgroundColor && actual.color === expected.color
        probe.remove()
        return matches
      }, hover)
    )
    .toBe(true)
}

const expectOutline = async (button: Locator) => {
  await expect(button).toBeVisible()
  await expect(button).not.toHaveClass(/bg-brand|bg-primary/)
  await expect
    .poll(() => button.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopWidth)))
    .toBeGreaterThan(0)
}

for (const width of [320, 1440]) {
  for (const dark of [false, true]) {
    test(`button colors: actions use brand and close uses outline at ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page
    }) => {
      test.setTimeout(120000)
      await page.setViewportSize({ width, height: 900 })
      for (const example of [
        { family: 'button', label: 'default' },
        { family: 'form', label: '確認' },
        { family: 'popover', label: '条件を開く' },
        { family: 'progress', label: '進捗を増やす' },
        { family: 'sonner', label: '通知を表示' },
        { family: 'tooltip', label: '応援' }
      ]) {
        await open(page, `ui-primitives--${example.family}`, dark)
        await expectBrand(page.getByRole('button', { name: example.label, exact: true }))
      }
      await page.screenshot({ path: test.info().outputPath('tooltip-button.png') })
      for (const example of [
        { family: 'dialog', label: '詳細を開く' },
        { family: 'drawer', label: '記念日を開く' }
      ]) {
        await open(page, `ui-primitives--${example.family}`, dark)
        const close = page.getByRole('button', { name: '閉じる', exact: true })
        await expectOutline(close)
        await close.click()
        await expectBrand(page.getByRole('button', { name: example.label, exact: true }))
      }
      await open(page, 'ui-primitives--alert-dialog', dark)
      await expectBrand(page.getByRole('button', { name: '確認', exact: true }))
      const cancel = page.getByRole('button', { name: 'キャンセル', exact: true })
      await expectOutline(cancel)
      await cancel.click()
      await expectBrand(page.getByRole('button', { name: '削除を確認', exact: true }))
      await open(page, 'ui-primitives--sheet', dark)
      const apply = page.getByRole('button', { name: '条件を反映', exact: true })
      await expectBrand(apply)
      await apply.click()
      await expectBrand(page.getByRole('button', { name: '条件を開く', exact: true }))
      for (const example of [
        { id: 'review-events--proposed-filter', label: '適用' },
        { id: 'review-events--failed-to-load', label: '再試行（モック）' },
        { id: 'review-route--ready', label: '訪問順を計算（モック）' },
        { id: 'components-characters-vote-burst--vote-burst', label: 'アニメーションを再生' },
        { id: 'components-pwa-update-prompt--update-prompt', label: '更新通知を表示' }
      ]) {
        await open(page, example.id, dark)
        if (example.id === 'review-events--proposed-filter') {
          await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
        }
        await expectBrand(page.getByRole('button', { name: example.label, exact: true }))
      }
      if (width === 320) {
        await open(page, 'pages-production--events', dark)
        await page.getByRole('button', { name: 'イベントを絞り込む', exact: true }).click()
        await expectBrand(page.getByRole('button', { name: '適用', exact: true }))
      }
    })

    test(`button colors: hover focus disabled and variants at ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, 'ui-primitives--button', dark)
      const button = page.getByRole('button', { name: 'default', exact: true })
      await expectBrand(button)
      await button.hover()
      await expectBrand(button, true)
      await page.mouse.move(0, 0)
      await page.keyboard.press('Tab')
      await button.focus()
      await expect(button).toBeFocused()
      expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
      expect(await button.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
      for (const variant of ['secondary', 'outline', 'ghost', 'destructive', 'link']) {
        await expect(page.getByRole('button', { name: variant, exact: true })).not.toHaveClass(/bg-brand/)
      }
      await open(page, 'ui-primitives--tooltip', dark)
      const tooltip = page.getByRole('button', { name: '応援', exact: true })
      await tooltip.hover()
      await expectBrand(tooltip, true)
      await expect(page.getByRole('tooltip')).toContainText('今日の応援を送る')
      await open(page, 'ui-primitives--button', dark, true)
      const disabled = page.getByRole('button', { name: 'default', exact: true })
      await expect(disabled).toBeDisabled()
      await expectBrand(disabled)
      await expect(disabled).toHaveCSS('opacity', '0.5')
      await expect(disabled).toHaveCSS('pointer-events', 'none')
      await open(page, 'review-route--empty', dark)
      const route = page.getByRole('button', { name: '訪問順を計算（モック）', exact: true })
      await expect(route).toBeDisabled()
      await expectBrand(route)
    })
  }
}
