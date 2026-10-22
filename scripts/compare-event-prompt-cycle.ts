import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { comparePromptCycleArms } from './lib/event-detect/prompt-cycle-compare'
import { writePromptCycleVersionTable } from './lib/event-detect/prompt-cycle-version-table'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    before: { type: 'string' },
    after: { type: 'string' },
    out: { type: 'string' }
  },
  strict: true
})
if (values.before === undefined || values.after === undefined || values.out === undefined)
  throw new Error('Comparison requires --before, --after and --out')
const output = resolve(values.out)
const result = await comparePromptCycleArms(resolve(values.before), resolve(values.after), output)
const versionTable = await writePromptCycleVersionTable(
  [resolve(values.before), resolve(values.after)],
  `${output}.md`,
  `${output}.csv`
)
console.log(
  JSON.stringify({ before: result.before.event, after: result.after.event, gate: result.gate, versionTable }, null, 2)
)
