import { z } from 'zod'

// 本番bot Workerの5分毎実行を、件数・成否・版だけで集計する。ログ本文やsecretは扱わない。
const account = process.argv.find((argument) => argument.startsWith('--account='))?.slice(10)
const since = process.argv.find((argument) => argument.startsWith('--since='))?.slice(8)
const token = process.env.CLOUDFLARE_API_TOKEN
if (!account || !since || !token) throw new Error('Pass --account= and --since= with CLOUDFLARE_API_TOKEN in the environment')
const query = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
  workersInvocationsAdaptive(limit:1000,filter:{scriptName:"musume-workers",datetime_geq:$s,datetime_leq:$e},orderBy:[datetimeFiveMinutes_ASC]){
    sum{requests errors} dimensions{datetimeFiveMinutes status scriptVersion}
  }}}}`
const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
  method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { a: account, s: since, e: new Date().toISOString() } })
})
const parsed = z.object({ data: z.object({ viewer: z.object({ accounts: z.array(z.object({
  workersInvocationsAdaptive: z.array(z.object({
    sum: z.object({ requests: z.number(), errors: z.number() }),
    dimensions: z.object({ datetimeFiveMinutes: z.string().nonempty(), status: z.string().nonempty(), scriptVersion: z.string().nonempty() })
  }))
})).length(1) }) }) }).safeParse(await response.json())
if (!response.ok || !parsed.success) throw new Error(`Cloudflare analytics query failed (HTTP ${response.status})`)
const rows = parsed.data.data.viewer.accounts[0].workersInvocationsAdaptive.map((row) => ({
  window: row.dimensions.datetimeFiveMinutes, status: row.dimensions.status,
  version: row.dimensions.scriptVersion, requests: row.sum.requests, errors: row.sum.errors
}))
console.log(JSON.stringify(rows))
