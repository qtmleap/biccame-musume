import { expect, test } from '@playwright/test'

test('real Firebase SDK + AuthProvider exchanges emulator token for cookie and logs out', async ({
  page,
  context,
  request
}) => {
  const blocked: string[] = []
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      blocked.push(url.origin)
      return route.abort()
    }
    return route.continue()
  })
  const signup = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
    { data: { email: 'fixture@example.test', password: 'synthetic-password', returnSecureToken: true } }
  )
  expect(signup.status()).toBe(200)
  await page.goto('/e2e/local/auth.html')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByTestId('session')).toHaveText('ready')
  const cookies = await context.cookies()
  const session = cookies.find((cookie) => cookie.name === 'session')
  expect(
    session && { httpOnly: session.httpOnly, sameSite: session.sameSite, path: session.path, secure: session.secure }
  ).toEqual({ httpOnly: true, sameSite: 'Lax', path: '/', secure: false })
  const privateResponse = await context.request.get('http://127.0.0.1:15300/api/session')
  expect(privateResponse.status()).toBe(200)
  const payload = await privateResponse.json()
  expect(payload.uid).toBe(await page.getByTestId('user').textContent())
  expect(payload.user.email).toBe('fixture@example.test')
  const logout = page.waitForResponse((response) => response.url().endsWith('/api/auth/logout'))
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  const logoutResponse = await logout
  expect(logoutResponse.status()).toBe(200)
  expect(await logoutResponse.headerValue('set-cookie')).toMatch(/session=;.*Max-Age=0/i)
  await expect(page).toHaveURL('http://127.0.0.1:15300/')
  await page.goto('/e2e/local/auth.html')
  await expect(page.getByTestId('session')).toHaveText('idle')
  expect((await context.cookies()).some((cookie) => cookie.name === 'session')).toBe(false)
  expect((await context.request.get('http://127.0.0.1:15300/api/session')).status()).toBe(401)
  expect(blocked).toEqual([])
})
