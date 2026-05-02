---
name: cloudflare-workers-backend
description: Backend architecture reference for Cloudflare Workers projects using Vinext App Router route handlers, Prisma with D1 adapter, Firebase Auth with HttpOnly cookie sessions, Workers AI via AI Gateway, and Zod validation. Load when writing API route handlers, database queries, auth middleware, or Workers AI integration.
---

# Cloudflare Workers Backend Stack

Patterns extracted from a production Cloudflare Workers backend. Copy the patterns, not the app-specific schema.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Cloudflare Workers (`compatibility_date = "2026-01-01"`, `compatibility_flags = ["nodejs_compat"]`) |
| API routing | Vinext App Router — `src/app/api/<feature>/route.ts` with exported `GET`/`POST`/`PUT`/`DELETE` functions |
| Database | Cloudflare **D1** (SQLite) via **Prisma** + `@prisma/adapter-d1` |
| ORM | Prisma 7 with `runtime = "cloudflare"` generator |
| Validation | **Zod** schemas shared with the frontend (`src/lib/schema.ts`, `schemas/*.dto.ts`) |
| Auth | Firebase Auth on client → ID token verified server-side → HttpOnly cookie with HS256 JWT |
| AI | Workers AI binding (`env.AI`) routed through **AI Gateway** for observability |
| Secrets / vars | `wrangler.toml` `[vars]` for public, `wrangler secret put` for sensitive |

## Directory layout

```
src/app/api/<feature>/route.ts   # Route handlers — export named GET/POST/PUT/DELETE
src/lib/
├─ db.ts                          # getPrisma(env) factory
├─ auth-middleware.ts             # getAuthUser(request) — Response | FirebaseUser
├─ session.ts                     # HS256 JWT sign/verify + cookie helpers
├─ schema.ts                      # Zod input schemas (shared w/ frontend)
├─ ai-gateway.ts                  # aiGatewayOptions(env, metadata) helper
├─ ai-rate-limit.ts               # checkAndIncrementAiUsage() — daily quota
└─ ai-models.ts                   # Allowed model IDs + tier gates
schemas/*.dto.ts                  # Zod output schemas (shared w/ frontend)
prisma/
├─ schema.prisma                  # provider = "sqlite", runtime = "cloudflare"
└─ migrations/                    # Auto-generated via prisma migrate dev
worker/
└─ index.ts                        # Entry: export { default } from "vinext/server/app-router-entry"
wrangler.toml                      # Bindings: D1, AI, vars
```

## Route handlers — the App Router pattern

Each `route.ts` exports named HTTP method functions. The handler receives a `Request` and returns a `Response`.

```ts
// src/app/api/foods/route.ts
import { env } from 'cloudflare:workers'
import { getAuthUser } from '@/lib/auth-middleware'
import { getPrisma } from '@/lib/db'
import { foodSchema } from '@/lib/schema'

export async function GET(request: Request) {
  const userOrRes = await getAuthUser(request)
  if (userOrRes instanceof Response) return userOrRes
  const user = userOrRes

  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? ''
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))

  const prisma = getPrisma(env)
  const foods = await prisma.food.findMany({
    where: q ? { userId: user.uid, name: { contains: q } } : { userId: user.uid },
    orderBy: q ? { name: 'asc' } : { createdAt: 'desc' },
    take: limit
  })

  return Response.json(foods.map((f) => ({ /* camelCase DTO shape */ })))
}

export async function POST(request: Request) {
  const userOrRes = await getAuthUser(request)
  if (userOrRes instanceof Response) return userOrRes
  const user = userOrRes

  const body = await request.json()
  const parsed = foodSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const prisma = getPrisma(env)
  const food = await prisma.food.create({ data: { ...parsed.data, userId: user.uid } })
  return Response.json({ /* shaped */ }, { status: 201 })
}
```

### Non-negotiable rules

- **`cloudflare:workers` import** — `import { env } from 'cloudflare:workers'` is how you reach bindings inside route handlers. Don't pass `env` through parameters.
- **First line of every authenticated handler** is the auth guard pattern below.
- **Always `safeParse`** incoming bodies with the shared Zod schema, never cast to a type.
- **Shape the response** explicitly — never return raw Prisma rows (snake_case columns leak through `@map`). Map to the camelCase DTO shape that matches `schemas/<Name>.dto.ts`.
- **Query param parsing** uses `new URL(request.url)` + `.searchParams`. Always clamp numeric params.

### Error response shape

```ts
{ error: string }                           // simple messages
{ error: { fieldErrors: {...}, formErrors: [...] } }   // from zod flatten()
```

The frontend's Zodios error plugin reads `data.error` when it's a string and displays it as a toast. Keep this contract.

## Auth middleware pattern

```ts
// src/lib/auth-middleware.ts
import { env } from 'cloudflare:workers'
import { SESSION_COOKIE, verifySessionJwt } from '@/lib/session'

export interface FirebaseUser {
  uid: string
  email: string
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? match[1] : null
}

export async function getAuthUser(request: Request): Promise<FirebaseUser | Response> {
  const cookieHeader = request.headers.get('Cookie') ?? ''
  const token = parseCookie(cookieHeader, SESSION_COOKIE)
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await verifySessionJwt(token, env.SESSION_SECRET)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  return { uid: session.uid, email: session.email }
}
```

**Return-type trick**: `FirebaseUser | Response`. The handler checks `instanceof Response` and short-circuits. This keeps auth concerns out of every handler while staying fully typed without any third-party middleware framework.

## Session pattern — HttpOnly cookie + HS256 JWT (no external deps)

Workers don't have Node crypto, so use `crypto.subtle` directly. This pattern is ~60 lines and requires zero dependencies:

```ts
// src/lib/session.ts
export const SESSION_COOKIE = '__session'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60   // 7 days

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function signSessionJwt(
  payload: { uid: string; email: string },
  secret: string
): Promise<string> {
  const enc = new TextEncoder()
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).buffer as ArrayBuffer)
  const body = base64url(
    enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + SESSION_MAX_AGE })).buffer as ArrayBuffer
  )
  const data = `${header}.${body}`
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return `${data}.${base64url(sig)}`
}

export async function verifySessionJwt(token: string, secret: string) {
  try {
    const [headerPart, bodyPart, sigPart] = token.split('.')
    if (!sigPart) return null
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC', key, base64urlDecode(sigPart), enc.encode(`${headerPart}.${bodyPart}`)
    )
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(bodyPart)))
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null
    if (typeof payload.uid !== 'string' || typeof payload.email !== 'string') return null
    return { uid: payload.uid, email: payload.email }
  } catch {
    return null
  }
}

export function sessionCookie(jwt: string): string {
  return `__session=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${SESSION_MAX_AGE}`
}

export function clearSessionCookie(): string {
  return `__session=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0`
}
```

### Login flow

1. Client authenticates with Firebase Auth, gets ID token.
2. POSTs ID token to `/api/auth/login`.
3. Server verifies the Firebase ID token with `firebase-auth-cloudflare-workers`, extracts `uid` + `email`.
4. Server issues HS256 JWT, sets it as `__session` cookie with `HttpOnly; Secure; SameSite=Lax; Path=/api`.
5. All subsequent API calls use the cookie — no Bearer header gymnastics on the frontend.

**Why HttpOnly cookie and not a Firebase ID token Bearer?**
- ID tokens expire in ~1 hour → requires constant refresh on the client.
- HttpOnly cookies are inaccessible to JavaScript → XSS-safe for session theft.
- Scoping to `Path=/api` avoids leaking the cookie to static asset requests.

## Prisma + D1 pattern

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma/client"
  runtime  = "cloudflare"
}

datasource db {
  provider = "sqlite"
}
```

```ts
// src/lib/db.ts
import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@/generated/prisma/client/edge'

export function getPrisma(env: Cloudflare.Env) {
  const adapter = new PrismaD1(env.DB)
  return new PrismaClient({ adapter })
}
```

- **One `getPrisma(env)` call per handler.** The client is cheap; don't memoize across requests (would leak between isolates).
- Schema fields use `@map("snake_case")` + camelCase TS names. Always shape the response explicitly when returning from handlers.
- **Never write migration SQL by hand.** Always `bunx prisma migrate dev --name <name>` and commit the generated SQL.
- Apply migrations to local D1 (miniflare reads a separate SQLite file from Prisma):
  ```sh
  for f in prisma/migrations/*/migration.sql; do
    bunx wrangler d1 execute <db-name> --local --file="$f"
  done
  ```
- For remote: add `--remote` instead of `--local`.

### Indexes

Always add `@@index([userId, ...])` on tables scoped per user. D1 is SQLite — missing indexes show up fast.

### `findFirst` vs `findUnique` for ownership checks

```ts
// ✅ Checks ownership in one query
const template = await prisma.mealTemplate.findFirst({
  where: { id, userId: user.uid }
})
if (!template) return Response.json({ error: 'Not found' }, { status: 404 })
```

Don't do `findUnique({ where: { id } })` then compare `template.userId` in JS — that's a second trip and leaks existence.

## Workers AI + AI Gateway pattern

```ts
// src/lib/ai-gateway.ts
type AiRunOptions = NonNullable<Parameters<Ai['run']>[2]>

export function aiGatewayOptions(
  env: { AI_GATEWAY_ID?: string },
  metadata?: Record<string, string>
): AiRunOptions | undefined {
  if (!env.AI_GATEWAY_ID) return undefined
  return {
    gateway: {
      id: env.AI_GATEWAY_ID,
      ...(metadata ? { metadata } : {})
    }
  }
}
```

```ts
// Usage in a route handler
const result = await env.AI.run(
  modelId as Parameters<typeof env.AI.run>[0],
  { messages: [{ role: 'user', content: prompt }], max_tokens: 256 },
  aiGatewayOptions(env, { userId: user.uid, endpoint: 'advice' })
)
```

- **Gateway id as a `[vars]` entry** in `wrangler.toml`, not a secret. One per environment (e.g. `health-app` / `health-app-staging`).
- **Metadata per call** — tag with `userId` + `endpoint` so the Gateway dashboard can slice by feature.
- **Tolerates missing gateway** — returns `undefined` when `AI_GATEWAY_ID` is empty so local dev works without configuring one.
- Gateway gives you neurons-consumed, cost, latency, cache hits, and per-request logs without any DB writes.

### Rate limiting pattern

Simple per-user daily counter in the DB:

```ts
// src/lib/ai-rate-limit.ts
export async function checkAndIncrementAiUsage(
  prisma: PrismaClient,
  userId: string,
  dailyLimit: number
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const usage = await prisma.aiUsage.upsert({
    where: { userId_date: { userId, date: today } },
    update: { count: { increment: 1 } },
    create: { userId, date: today, count: 1 }
  })
  return usage.count <= dailyLimit
}
```

```prisma
model AiUsage {
  id     String @id @default(dbgenerated("(lower(hex(randomblob(16))))"))
  userId String @map("user_id")
  date   String
  count  Int    @default(0)
  @@unique([userId, date])
  @@map("ai_usage")
}
```

Handler pattern:

```ts
const allowed = await checkAndIncrementAiUsage(prisma, user.uid, DAILY_LIMITS.free)
if (!allowed) {
  return Response.json({ error: 'Daily AI request limit reached' }, { status: 429 })
}
```

**Always return a descriptive error message**, not just the status code. The frontend surfaces `data.error` as the toast message.

## Parsing AI text responses

LLMs return free-form text; when you need JSON, match+parse safely:

```ts
const text = aiResponse.response
const match = text.match(/\{[\s\S]*?\}/)
if (!match) return Response.json({ error: 'AI response parse failed', raw: text }, { status: 502 })
const parsed = JSON.parse(match[0])
```

Validate the parsed object with Zod before returning. Return `502` for model-side errors so the frontend can distinguish from `400` (user input errors).

## `wrangler.toml` skeleton

```toml
name = "my-app"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
main = "./worker/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "my-app-db"
database_id = "..."

[ai]
binding = "AI"

[vars]
AI_GATEWAY_ID = "my-app"
FIREBASE_PROJECT_ID = "..."

[observability]
enabled = true
head_sampling_rate = 1

# Separate env per environment
[env.staging]
name = "my-app-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "my-app-db-staging"
database_id = "..."

[env.staging.ai]
binding = "AI"

[env.staging.vars]
AI_GATEWAY_ID = "my-app-staging"
```

**After any `wrangler.toml` change, run `bunx wrangler types`** to regenerate `worker-configuration.d.ts`.

## Vite plugin wiring (for Vinext)

```ts
// vite.config.ts
import vinext from 'vinext'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      persistState: true,
      remoteBindings: false
    })
  ],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname }
  }
})
```

`worker/index.ts` is a one-liner:

```ts
export { default } from 'vinext/server/app-router-entry'
```

## Prisma on Workers: source map quirk

Prisma's generated client ships with source maps that break Vite's module graph. Add this plugin:

```ts
function prismaSourcemapFix(): Plugin {
  return {
    name: 'prisma-sourcemap-fix',
    enforce: 'pre',
    load(id) {
      if (id.includes('/generated/prisma/') && id.endsWith('.js')) {
        const code = readFileSync(id, 'utf-8')
        return { code: code.replace(/\/\/# sourceMappingURL=.*$/m, ''), map: null }
      }
    }
  }
}
```

## Anti-patterns to avoid

- ❌ Returning raw Prisma rows — snake_case column names leak through `@map`.
- ❌ Writing D1 migrations by hand — always `prisma migrate dev`.
- ❌ `findUnique({ where: { id } })` then checking `userId` in JS for ownership checks.
- ❌ Returning bare status codes like `new Response(null, { status: 429 })` — always include `{ error: string }` so the frontend toast shows something useful.
- ❌ Memoizing `PrismaClient` in module-level globals — it leaks across isolates.
- ❌ Writing AI route handlers without the rate-limit check — quota will burn instantly.
- ❌ Inline auth checks (`const user = ...; if (!user) return ...`) duplicated per handler — use `getAuthUser` + `instanceof Response`.
- ❌ Skipping AI Gateway — you'll have zero visibility into model usage.
- ❌ `compatibility_flags = ["nodejs_compat_v2"]` without also setting a recent `compatibility_date`.

## Bootstrap checklist

1. `bun install` — Prisma 7, `@prisma/adapter-d1`, `firebase-auth-cloudflare-workers`, `zod`, `vinext`, `@cloudflare/vite-plugin`.
2. Create a D1 database: `bunx wrangler d1 create <name>`, copy the id into `wrangler.toml`.
3. `prisma/schema.prisma` with `runtime = "cloudflare"`, `provider = "sqlite"`.
4. `bunx prisma migrate dev --name init`, then apply SQL to D1 local with the loop above.
5. Copy `src/lib/db.ts`, `session.ts`, `auth-middleware.ts`, `ai-gateway.ts`, `ai-rate-limit.ts`.
6. Create AI Gateway in Cloudflare dashboard, add id to `[vars].AI_GATEWAY_ID`.
7. `bunx wrangler secret put SESSION_SECRET` — long random string.
8. `bunx wrangler types` to generate `worker-configuration.d.ts`.
9. First `route.ts` — use the foods route as the template.
