import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const output = resolve('.cache/a15')
mkdirSync(output, { recursive: true })
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const items = (directory: string) => {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry): string[] => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory() && !entry.name.includes('cache')
        ? items(path)
        : entry.isFile() && /\.(png|webp|json)$/.test(entry.name)
          ? [path]
          : []
    })
  } catch {
    return []
  }
}
const section = (title: string, files: string[]) =>
  `<section><h2>${escapeHtml(title)}</h2><div class="grid">${files
    .filter((file) => /\.(png|webp)$/.test(file))
    .map((file) => {
      const href = escapeHtml(relative(output, file))
      const label = escapeHtml(relative(resolve('.'), file))
      const records = files.filter(
        (record) => record.endsWith('.json') && record.startsWith(file.replace(/\.(png|webp)$/, ''))
      )
      return `<figure><figcaption>${label}</figcaption><a href="${href}"><img loading="lazy" alt="${label}" src="${href}"></a>${records.map((record) => `<a href="${escapeHtml(relative(output, record))}">Raw measurements</a>`).join('')}</figure>`
    })
    .join('')}</div></section>`
const scratch = resolve('.superpowers/sdd/2026-10-02-ui-ux-design-plan/scratch')
const candidates = items(resolve(output, 'candidates'))
const workerSections = Array.from({ length: 9 }, (_, index) => `b0${index + 1}`)
  .map((task) =>
    section(
      `${task}: preserved before / after evidence (see task reports for limitations)`,
      items(task === 'b06' ? resolve('.cache/b06') : resolve(scratch, task)).filter((path) =>
        /\/(before|after|font-recheck)\//.test(path)
      )
    )
  )
  .join('')
writeFileSync(
  resolve(output, 'gallery.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>UI screenshot candidates — pending human approval</title><style>body{font:16px system-ui;margin:24px;background:#fafafa;color:#171717}h1,h2{line-height:1.3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}figure{margin:0;background:white;padding:12px;border:1px solid #bbb}img{width:100%;max-height:700px;object-fit:contain;object-position:top}figcaption{overflow-wrap:anywhere;margin-bottom:10px}a{color:#0050a0}section{margin-top:36px}</style><h1>UI candidates: human approval pending</h1><p>These candidates use fixed clock, fixtures, local production fonts and light/dark paint guards. Candidate comparisons verify stability within this run. They are not approved production baselines. Normal comparison uses updateSnapshots: none.</p><p>Worker before/after artifacts retain their original provenance. Earlier B01/B02 captures omitted exact font imports; font-recheck records cover corrected 375/1280 captures. Known invalid before/dark captures remain preserved and must not support comparison claims. Staging verification of unmerged changes is pending; no deployment was performed.</p>${section('Current 375px / 1280px candidates', candidates)}${workerSections}</html>`
)
