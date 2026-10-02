export type FixtureState = 'ready' | 'empty' | 'loading' | 'error'
export type FixtureOptions = { state?: FixtureState; authenticated?: boolean; access?: boolean }
export const runtime = {
  state: 'ready' as FixtureState,
  authenticated: false,
  access: true,
  calls: [] as string[],
  unexpected: [] as string[]
}
export const configureFixture = (options: FixtureOptions = {}) => {
  runtime.state = options.state ?? 'ready'
  runtime.authenticated = options.authenticated ?? false
  runtime.access = options.access ?? true
  runtime.calls.length = 0
  runtime.unexpected.length = 0
}
