import { runArchiveCli } from './archive-list-posts'
import { archiveDiagnostic } from './lib/post-archive'

if (import.meta.main)
  runArchiveCli('list').catch((error) => {
    console.error(archiveDiagnostic(error))
    process.exitCode = 1
  })
