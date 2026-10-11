import { expect, type Page, test } from '@playwright/test'

const open = async (page: Page, family: string, disabled = false, dark = false) => {
  await page.goto(
    `/iframe.html?id=ui-primitives--${family}&viewMode=story&args=disabled:${disabled}${dark ? '&globals=theme:dark' : ''}`
  )
  await expect(page.getByTestId('ui-family')).toBeVisible()
}

for (const width of [320, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`form primitives: associated labels and spacing at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme })
      for (const example of [
        { family: 'input', label: 'キャラクター検索', initial: '', status: true },
        { family: 'label', label: '店舗名', initial: 'あべの店', status: false },
        {
          family: 'textarea',
          label: 'イベント紹介',
          initial: '店舗の周年イベントを確認できます。',
          status: true
        }
      ]) {
        await open(page, example.family, false, colorScheme === 'dark')
        await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /dark/ : /^$/)
        const input = page.getByLabel(example.label, { exact: true })
        await expect(input).toHaveValue(example.initial)
        await expect(input).toBeEnabled()
        await expect(input).toHaveAttribute('aria-invalid', 'false')
        const label = page.getByText(example.label, { exact: true })
        await expect
          .poll(async () => {
            const labelBox = await label.boundingBox()
            const inputBox = await input.boundingBox()
            if (!labelBox || !inputBox) throw new Error('Form label or control is not visible')
            return inputBox.y - labelBox.y - labelBox.height
          })
          .toBe(8)
        await page.screenshot({ path: test.info().outputPath(`${example.family}-${colorScheme}-${width}.png`) })
        await label.click()
        await expect(input).toBeFocused()
        await input.fill('更新した紹介文')
        await expect(input).toHaveValue('更新した紹介文')
        if (example.status) await expect(page.getByRole('status')).toHaveText('更新した紹介文')
      }
    })
  }
}

test('form primitives: input and textarea preserve disabled state and initial values', async ({ page }) => {
  for (const example of [
    { family: 'input', label: 'キャラクター検索', initial: '' },
    { family: 'textarea', label: 'イベント紹介', initial: '店舗の周年イベントを確認できます。' }
  ]) {
    await open(page, example.family, true)
    const input = page.getByLabel(example.label, { exact: true })
    await expect(input).toBeDisabled()
    await expect(input).toHaveValue(example.initial)
  }
})

test('form primitives: required form reports an accessible error and accepts a valid value', async ({ page }) => {
  await open(page, 'form')
  const name = page.getByLabel('名前', { exact: true })
  await expect(name).toHaveValue('')
  await page.getByRole('button', { name: '確認', exact: true }).click()
  await expect(page.getByText('名前を入力してください', { exact: true })).toBeVisible()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await name.fill('あべのたん')
  await page.getByRole('button', { name: '確認', exact: true }).click()
  await expect(name).toHaveAttribute('aria-invalid', 'false')
  await expect(page.getByText('名前を入力してください', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('操作を確認しました')
})
