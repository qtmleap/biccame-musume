---
name: pwa-update-flow
description: PWA update notification and cache invalidation pattern for Vite + Service Worker apps. Covers the full flow — build-time version stamp, /api/version endpoint, version-check hook, update banner UI, Service Worker unregister + caches.delete() + hard reload. Load when adding PWA install, Service Worker registration, update prompts, or cache-invalidation flows.
---

# PWA Update Flow (Service Worker + Version Check)

A complete, working pattern for PWAs, with no libraries (~120 lines of code total). It:

- Ships updates to users already running the installed app.
- Shows a non-intrusive "update available" banner.
- Cleanly wipes old caches before reloading.

## Why not `vite-plugin-pwa` or Workbox?

Both are fine tools, but they:

- Generate opaque runtime code you can't easily debug.
- Couple the cache strategy to build config instead of keeping it in one readable file.
- Overfit to SPA shells and make custom update UX awkward.

For apps with simple caching needs (static assets cache-first, HTML network-first, API never cached), a hand-written ~50-line Service Worker is clearer and more maintainable.

## Architecture

The build-time version stamp flows through the system like this:

1. `vite.config` injects `__APP_VERSION__` at build time.
2. `__APP_VERSION__` feeds three consumers:
   - The `/api/version` GET endpoint, which returns `{version}`.
   - The `localStorage` key `"app_version"`.
   - The Service Worker cache name.
3. The `useVersionCheck` hook polls on mount, comparing `/api/version` against the stored `localStorage` value.
4. On mismatch, the update banner appears. When the user taps it, the update runs:
   1. `sw.update()`
   2. `caches.keys()` + `caches.delete()`
   3. Clear the `localStorage` version.
   4. `window.location.reload()`

## Part 1: Build-time version stamp

```ts
// vite.config.ts
const buildVersion = Date.now().toString(36)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion)
  },
  // ...
})
```

A base-36 timestamp gives monotonic, short, URL-safe IDs with no git dependency. If you prefer the git SHA instead: `execSync('git rev-parse --short HEAD').toString().trim()`.

For TypeScript, declare the global in any file that uses it:

```ts
declare const __APP_VERSION__: string
```

## Part 2: `/api/version` endpoint

Trivial — it returns the same compile-time constant the client already has:

```ts
// src/app/api/version/route.ts
declare const __APP_VERSION__: string

export function GET() {
  return Response.json({ version: __APP_VERSION__ })
}
```

**Key insight:** the client's bundled JS has version X baked in. When the server redeploys with version Y, `/api/version` returns Y while the client's constant is still X — mismatch detected. No separate version file, no manual bumping.

## Part 3: The `useVersionCheck` hook

```ts
// src/lib/use-version-check.ts
import { useEffect, useState } from 'react'

declare const __APP_VERSION__: string

const VERSION_KEY = 'app_version'

type UpdateState = 'idle' | 'preparing' | 'ready'

export function useVersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [state, setState] = useState<UpdateState>('idle')

  useEffect(() => {
    if (import.meta.env.DEV) return  // don't nag during dev

    const check = async () => {
      try {
        const res = await fetch('/api/version')
        if (!res.ok) return
        const { version } = (await res.json()) as { version: string }
        const stored = localStorage.getItem(VERSION_KEY)
        if (!stored) {
          localStorage.setItem(VERSION_KEY, version)
          return
        }
        if (stored !== version) {
          setHasUpdate(true)
        }
      } catch {
        // Offline or API down — fail silently, no banner
      }
    }
    check()
  }, [])

  const prepare = async () => {
    setState('preparing')

    // 1. Tell the Service Worker to fetch the new sw.js
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) await reg.update()
    }

    // 2. Nuke all caches so the new SW installs fresh
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))

    // 3. Clear the stored version — next load will re-prime it
    localStorage.removeItem(VERSION_KEY)

    // 4. Intentional delay so the progress bar animation can complete
    await new Promise((r) => setTimeout(r, 2000))
    setState('ready')
  }

  const reload = () => window.location.reload()

  return { hasUpdate, state, prepare, reload }
}
```

### Design choices worth keeping

- **Seed `localStorage` on first visit; do not set `hasUpdate`.** First-load users have no baseline to compare against — skip the banner until the *second* visit after an update ships.
- **Two-step flow.** `prepare()` runs the cache wipe and shows a progress animation; `reload()` is a separate user action. Don't auto-reload — users lose in-progress form input.
- **`import.meta.env.DEV` guard.** The dev server has hot reload; update banners are unnecessary there.
- **Failure is silent.** If `/api/version` is unreachable (offline, API down), show neither a stale banner nor an error toast.

## Part 4: Update banner UI

The banner is a regular component that consumes the hook. Keep it minimal and non-blocking — users should never be forced to update mid-task:

```tsx
const { hasUpdate, state: updateState, prepare, reload } = useVersionCheck()

{hasUpdate && updateState === 'idle' && (
  <button type='button' onClick={prepare} className='...'>
    <RefreshCw />
    <div>
      <p>Update available</p>
      <p>Tap to install the latest version</p>
    </div>
  </button>
)}

{/* Full-screen overlay during the update */}
<AnimatePresence>
  {updateState !== 'idle' && (
    <div className='fixed inset-0 z-50 bg-black/40 backdrop-blur-sm ...'>
      <m.div animate={updateState === 'preparing' ? { rotate: 360 } : { rotate: 0 }}>
        <RefreshCw />
      </m.div>
      <p>{updateState === 'preparing' ? 'Updating...' : 'Update ready'}</p>
      {/* Progress bar that fills in 2s (matches the setTimeout in prepare()) */}
      <m.div animate={{ width: '100%' }} transition={{ duration: 2 }} />
      {updateState === 'ready' && (
        <Button onClick={reload}>Reload</Button>
      )}
    </div>
  )}
</AnimatePresence>
```

UX notes:

- The banner lives inline in the page content, not as a fixed toast — this respects the user's scroll position.
- The overlay appears only *after* the user opts in via `prepare()`. It is explanatory, not interruptive.
- The progress bar duration equals the `setTimeout(2000)` inside `prepare()` — the animation is cosmetic, not functional.
- After `ready`, the Reload button is the only action — no auto-reload.

## Part 5: The Service Worker

Short, readable, one file in `public/sw.js`:

```js
// public/sw.js
const CACHE_NAME = 'myapp-v2'
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/

self.addEventListener('install', (event) => {
  self.skipWaiting()  // activate immediately on next load
})

self.addEventListener('activate', (event) => {
  // Delete any cache that isn't the current version
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()  // take control of open tabs immediately
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API — always hit network, never cache
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // Navigation (HTML documents) — network-first, fall back to cached root
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')))
    return
  }

  // Static assets — cache-first, then network, then cache the new response
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Everything else — pass through to network
})
```

### Three rules that matter

1. **Never cache `/api/*`.** Returning early from the `fetch` handler means no cache interference — the browser handles the request normally.
2. **Network-first for HTML.** Users always see the freshest entry point. When offline, it falls back to the cached root so the app shell still loads.
3. **Cache-first for hashed assets.** Vite's bundled JS/CSS have content hashes in the filename, so once cached they never go stale — an old hash simply stops being referenced.

### Why `skipWaiting()` + `clients.claim()`?

Without them, a new SW sits in "waiting" state until every tab closes — users stay stuck on the old version for days. This pair activates the new SW on the next page load, which pairs perfectly with the "Reload" button in `useVersionCheck`.

### Bumping `CACHE_NAME`

- **Do bump** the version in the name (`myapp-v2` → `myapp-v3`) when you change cache strategy or want to force-evict everything. The `activate` handler automatically deletes all other caches.
- **Otherwise leave it alone** — content-hashed asset filenames handle cache busting naturally.

## Part 6: Register the SW inline in `<head>`

```tsx
// src/app/layout.tsx (or index.html)
<script
  // biome-ignore lint/security/noDangerouslySetInnerHtml: registration must run inline
  dangerouslySetInnerHTML={{
    __html: `if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')`
  }}
/>
```

Inline registration (not in a module) is intentional:

- Runs before React mounts — catches the first render.
- No import waterfall.
- Safely guarded by the feature check.

## Part 7: Web App Manifest

```json
// public/manifest.json
{
  "name": "My App",
  "short_name": "My App",
  "description": "...",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#22c55e",
  "icons": [
    { "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" },
    { "src": "/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

Linked from `<head>`:

```tsx
<link rel='manifest' href='/manifest.json' />
<meta name='theme-color' content='#22c55e' />
<meta name='mobile-web-app-capable' content='yes' />
<meta name='apple-mobile-web-app-status-bar-style' content='default' />
<link rel='apple-touch-icon' href='/icon-192.svg' />
```

### Must-have for iOS install

iOS Safari requires all four of the following; missing any one degrades the installed experience:

- `apple-mobile-web-app-capable`
- `apple-mobile-web-app-status-bar-style`
- `apple-touch-icon`
- a `theme-color` meta

## Part 8: Theme initialization (avoid flash)

Runs **inline before paint** so dark mode doesn't flash on load:

```tsx
<script
  // biome-ignore lint/security/noDangerouslySetInnerHtml: must run before paint
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`
  }}
/>
```

Keep it tiny and IIFE-wrapped. Any error (e.g. blocked localStorage) is caught so it never breaks the page.

## Anti-patterns to avoid (DON'T)

- **DON'T cache API responses in the SW.** Leads to stale-data bugs that are hard to reproduce.
- **DON'T auto-reload when an update is detected.** Users lose in-progress form input and get whiplashed.
- **DON'T poll `/api/version` every N seconds.** A mount-only check is plenty — users will remount via navigation.
- **DON'T register the SW inside a React `useEffect`.** It delays activation by one hydration cycle and races with the first navigation.
- **DON'T use a module SW (`type: 'module'`) unless you need it.** Browser support and caching semantics are trickier; a classic SW is simpler and ubiquitous.
- **DON'T hard-code the version string in source.** Use a build-time `define` so every build gets a unique id automatically.
- **DON'T use Workbox / `vite-plugin-pwa` for simple needs.** Generated runtime code is hard to debug and overkill for 50 lines of hand-written logic.
- **DON'T show the update banner on first load.** Seed `localStorage` without setting `hasUpdate` — there is no old version to compare against yet.
- **DON'T omit `self.clients.claim()`.** The new SW won't take over existing tabs, making the update banner feel like a lie.

## Testing the update flow locally

1. `bun run build && bun run preview` (or deploy).
2. Open the app. `localStorage.getItem('app_version')` is now set.
3. `bun run build` again — the timestamp changes, so `__APP_VERSION__` bumps.
4. Refresh the tab *without* cleaning — the banner should appear.
5. Tap it → overlay → reload → the new version loads.
6. DevTools → Application → Cache Storage: only the new cache name remains.

## Bootstrap checklist

1. `vite.config.ts` — add `define: { __APP_VERSION__: JSON.stringify(Date.now().toString(36)) }`.
2. Create `src/app/api/version/route.ts` (or equivalent) returning `{ version: __APP_VERSION__ }`.
3. Create `src/lib/use-version-check.ts` — copy the hook verbatim; adjust the dev guard if needed.
4. Create `public/sw.js` — copy the SW verbatim; replace `CACHE_NAME`.
5. Create `public/manifest.json` — adjust colors, icons, name.
6. Add the inline SW registration + manifest/theme meta tags to `<head>`.
7. Add the update banner component wherever the app's landing view lives.
8. Build, preview, and verify the flow end-to-end before shipping.
