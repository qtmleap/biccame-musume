import type { ArchiveProgress } from './post-archive'

/** Display-only observer. The collector owns durable counts and account ordering. */
export const createArchiveProgressRenderer = (options: {
  write: (value: string) => void
  isTTY: boolean
  ansi?: boolean
  columns?: () => number | undefined
}) => {
  const overwrite = options.isTTY && options.ansi !== false
  let enabled = true
  let activeRow = false
  let lastLine: string | undefined
  const write = (value: string) => {
    if (!enabled) return
    try {
      options.write(value)
    } catch {
      enabled = false
    }
  }
  return {
    update: (snapshot: ArchiveProgress) => {
      if (!enabled) return
      const core = `${snapshot.date} ${snapshot.posts}p ${snapshot.pages}pg ${snapshot.seedPages}seed`
      const retryLabel = snapshot.retry
        ? `retrying #${snapshot.retry.attempt} ${snapshot.retry.delayMs / 1000}s ${snapshot.retry.kind}`
        : undefined
      const summary = `${core} ${snapshot.accounts.length}a ${retryLabel ?? snapshot.status}`
      const handles = snapshot.accounts.slice(0, 5).map((account) => {
        const handle = account.screenName.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) || '?'
        return ` @${handle}:${account.posts}`
      })
      const rawWidth = options.columns?.()
      const width = rawWidth && Number.isFinite(rawWidth) && rawWidth > 0 ? Math.floor(rawWidth) : 80
      const limit = Math.max(0, width - 1)
      let row = overwrite && summary.length > limit ? (retryLabel ?? core) : summary
      for (const handle of handles) {
        if (overwrite && row.length + handle.length > limit) break
        row += handle
      }
      row = row.replace(/[^\x20-\x7e]/g, '')
      if (overwrite) row = row.slice(0, limit)
      if (row === lastLine) return
      lastLine = row
      if (overwrite) {
        write(`\r\x1b[2K${row.slice(0, limit)}`)
        activeRow = enabled
      } else write(`${row}\n`)
    },
    finish: () => {
      if (activeRow) write('\n')
      activeRow = false
    },
    disable: () => {
      enabled = false
      activeRow = false
    }
  }
}
