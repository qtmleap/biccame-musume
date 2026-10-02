import { expect, type Locator, type Page } from '@playwright/test'

export async function assertHealthyScreen(
  page: Page,
  heading: string,
  role: 'heading' | 'button' | 'text' = 'heading'
) {
  await expect(page.getByRole('heading', { name: 'エラーが発生しました', exact: true })).toHaveCount(0)
  await expect(
    (role === 'text'
      ? page.getByText(heading, { exact: true })
      : page.getByRole(role, { name: heading, exact: true })
    ).first()
  ).toBeVisible()
}

export async function assertStickyPosition(header: Locator, top: number) {
  const box = await header.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs((box?.y ?? Number.NaN) - top)).toBeLessThanOrEqual(2)
}
