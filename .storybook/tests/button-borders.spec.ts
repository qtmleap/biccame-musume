import { expect, type Locator, type Page, test } from '@playwright/test'

const open = async (page: Page, id: string, dark: boolean, disabled = false) => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&args=disabled:${disabled}${dark ? '&globals=theme:dark' : ''}`)
  await expect(page.getByTestId('review-frame')).not.toBeEmpty({ timeout: 20000 })
  await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^$/)
}

const expectSurface = async (button: Locator, hover = false) => {
  await expect(button).toBeVisible()
  await expect
    .poll(() =>
      button.evaluate((element, hovered) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = hovered ? 'var(--button-surface-hover)' : 'var(--button-surface)'
        probe.style.color = 'var(--button-surface-foreground)'
        probe.style.outline = '1.5px solid var(--card-border)'
        probe.style.outlineOffset = '-1.5px'
        document.body.appendChild(probe)
        const expected = getComputedStyle(probe)
        const actual = getComputedStyle(element)
        const matches =
          actual.backgroundColor === expected.backgroundColor &&
          actual.color === expected.color &&
          actual.borderTopColor === 'rgba(0, 0, 0, 0)' &&
          actual.outlineColor === expected.outlineColor &&
          actual.outlineWidth === expected.outlineWidth &&
          actual.outlineOffset === expected.outlineOffset
        probe.remove()
        return matches
      }, hover)
    )
    .toBe(true)
}

const checkButton = async (page: Page, button: Locator) => {
  await page.mouse.move(0, 0)
  await button.evaluate((element) => {
    if (element instanceof HTMLElement) element.blur()
  })
  await expectSurface(button)
  await button.hover()
  await expectSurface(button, true)
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  await button.focus()
  await expect(button).toBeFocused()
  expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  expect(await button.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
}

for (const width of [320, 1440]) {
  for (const dark of [false, true]) {
    test(`button borders: outline surfaces and focus at ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(90000)
      await page.setViewportSize({ width, height: 900 })
      await open(page, 'ui-primitives--button', dark)
      await checkButton(page, page.getByRole('button', { name: 'outline', exact: true }))
      await open(page, 'ui-primitives--button', dark, true)
      const disabled = page.getByRole('button', { name: 'outline', exact: true })
      await expect(disabled).toBeDisabled()
      await expect(disabled).toHaveCSS('opacity', '0.5')
      await expectSurface(disabled)
      for (const family of ['dialog', 'drawer']) {
        await open(page, `ui-primitives--${family}`, dark)
        const close = page.getByRole('button', { name: '閉じる', exact: true })
        await expect(close).toHaveAttribute('data-slot', `${family}-close`)
        await checkButton(page, close)
        await page.screenshot({ path: test.info().outputPath(`${family}-close.png`) })
      }
      await open(page, 'ui-primitives--alert-dialog', dark)
      const cancel = page.getByRole('button', { name: 'キャンセル', exact: true })
      await expect(cancel).toHaveAttribute('data-slot', 'alert-dialog-cancel')
      await checkButton(page, cancel)
      await open(page, 'pages-production--events', dark)
      const trigger = page.getByRole('button', { name: 'イベントを絞り込む', exact: true })
      await expect(trigger).toHaveAttribute('data-slot', 'dialog-trigger')
      await checkButton(page, trigger)
      await trigger.click()
      await expect(page.getByRole('dialog')).toBeVisible()
    })
  }
}
