import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

// Phase 3の作業ツリーを本番TL切替へ混ぜない。Phase 2の固定ソースを別ディレクトリでビルドする。
if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const run = async (args: string[], cwd = root, extraEnv: Record<string, string> = {}) => {
    const child = Bun.spawn(args, {
      cwd,
      env: {
        PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG, ...extraEnv
      },
      stdout: 'pipe', stderr: 'pipe'
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
    ])
    if (code !== 0) {
      // 認証文字列がエラーに含まれる可能性があるため、失敗時はコマンド名と終了コードだけを出す。
      throw new Error(`Phase 2 isolated build failed: ${args[0]} exited ${code}`)
    }
    return { stdout, stderr }
  }
  const revision = (await run(['git', 'rev-parse', 'b2bf42709e5881c04046c2eb79f7d21f39e00e6e^{commit}'])).stdout.trim()
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid phase 2 source revision')
  const output = resolve(root, `.cache/bot-phase2-deployment-${revision}.json`)
  if (existsSync(output)) throw new Error('A phase 2 build manifest already exists; do not overwrite it')
  mkdirSync(resolve(root, '.cache'), { recursive: true })
  const sourceRoot = mkdtempSync(resolve(root, `.cache/bot-phase2-${revision}-`))
  const archive = resolve(sourceRoot, 'source.tar')
  await run(['git', 'archive', '--format=tar', `--output=${archive}`, revision,
    'package.json', 'bun.lock', '.npmrc', 'tsconfig.json', 'patches',
    'workers/bot', 'packages/shared', 'workers/app/package.json', 'workers/app/wrangler.toml',
    'bunfig.toml', '__tests__/setup.ts', '__tests__/bot-worker.test.ts', '__tests__/bot-timeline.test.ts',
    'scripts/virtual-characters-plugin.ts', 'scripts/deploy-bot.ts', 'scripts/test-bot-rpc.ts'])
  await run(['tar', '-xf', archive, '-C', sourceRoot])
  const token = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN : (await run(['gh', 'auth', 'token'])).stdout.trim()
  if (!token) throw new Error('GitHub Packages read authorization is required')
  await run(['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], sourceRoot, { GITHUB_TOKEN: token })
  await run(['bunx', 'tsc', '--noEmit', '-p', 'workers/bot/tsconfig.json'], sourceRoot)
  await run(['bun', 'test', '__tests__/bot-worker.test.ts', '__tests__/bot-timeline.test.ts'], sourceRoot)
  await run(['bun', 'run', 'build:bot'], sourceRoot, { CLOUDFLARE_ENV: 'production' })
  await run(['bun', 'run', 'test:bot-rpc'], sourceRoot)
  const isolated = await import(resolve(sourceRoot, 'scripts/deploy-bot.ts'))
  const configPath: string = isolated.getBotDeploymentConfigPath(sourceRoot, 'production')
  const config = z.object({
    main: z.string().nonempty(), configPath: z.string().nonempty(),
    name: z.literal('musume-workers'), services: z.array(z.unknown()).length(0),
    triggers: z.object({ crons: z.array(z.unknown()).length(0) }),
    vars: z.strictObject({ OPENAI_BASE_URL: z.literal('https://ai.qleap.jp/v1'),
      OPENAI_MODEL: z.literal('codex,gpt-5.6-luna'), TL_NOTIFICATIONS_ENABLED: z.literal('false') })
  }).safeParse(JSON.parse(readFileSync(configPath, 'utf8')))
  if (!config.success) throw new Error('Isolated phase 2 bundle configuration mismatch')
  const bundle = resolve(configPath, '..', config.data.main)
  const bundleSha256 = new Bun.CryptoHasher('sha256').update(readFileSync(bundle)).digest('hex')
  const manifest = { sourceSha: revision, sourceRoot, configPath, bundleSha256, builtAt: new Date().toISOString() }
  writeFileSync(output, JSON.stringify(manifest, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ manifest: output, sourceSha: revision, bundleSha256 }))
}
