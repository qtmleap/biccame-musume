import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'
import { z } from 'zod'
const { values } = parseArgs({ args: process.argv.slice(2), options: { name: { type: 'string' } }, strict: true })
const name = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .safeParse(values.name)
if (!name.success) throw new Error('Freeze requires a safe --name')
const root = path.resolve('.wrangler/benchmarks/goal-pipeline')
await mkdir(root, { recursive: true, mode: 0o700 })
const entry = path.join(root, `${name.data}-entry.ts`)
const outfile = path.join(root, `${name.data}.mjs`)
if (await Bun.file(outfile).exists()) throw new Error('Frozen pipeline already exists')
await writeFile(
  entry,
  [
    "export * from '../../../packages/shared/src/event-detect/detection'",
    "export * from '../../../packages/shared/src/event-detect/extraction'",
    "export { extractWebhookEvents } from '../../../workers/web/src/api/services/webhook-extraction'"
  ].join('\n') + '\n',
  { flag: 'wx', mode: 0o600 }
)
const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  metafile: true,
  plugins: [
    {
      name: 'freeze-shared-source',
      setup(builder) {
        builder.onResolve({ filter: /^@biccame\/shared\// }, (args) => ({
          path: path.resolve('packages/shared/src', args.path.slice('@biccame/shared/'.length) + '.ts')
        }))
      }
    }
  ]
})
const raw: unknown = await import(outfile)
const versions = z
  .object({ DETECTION_VERSION: z.string().nonempty(), EXTRACTION_VERSION: z.string().nonempty() })
  .safeParse(raw)
if (!versions.success) throw new Error('Invalid frozen versions')
const dependencies = await Promise.all(
  ['zod', 'dayjs'].map(async (name) => {
    const parsed = z
      .object({ version: z.string().nonempty() })
      .safeParse(await Bun.file(Bun.resolveSync(`${name}/package.json`, process.cwd())).json())
    if (!parsed.success) throw new Error('Invalid dependency version')
    return [name, parsed.data.version]
  })
)
const source = await readFile(outfile)
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const inputs = await Promise.all(
  Object.keys(result.metafile.inputs)
    .sort()
    .map(async (file) => ({ file, sha256: hash(await readFile(file)) }))
)
const metadata = {
  version: versions.data.DETECTION_VERSION,
  extractionVersion: versions.data.EXTRACTION_VERSION,
  bundleSha256: hash(source),
  externalDependencies: Object.fromEntries(dependencies),
  inputs
}
await writeFile(outfile.replace(/\.mjs$/, '.meta.json'), JSON.stringify(metadata, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600
})
console.log(JSON.stringify(metadata, null, 2))
