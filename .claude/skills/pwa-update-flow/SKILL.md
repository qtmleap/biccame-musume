---
name: pwa-update-flow
description: PWA update notification and cache invalidation pattern for Vite + Service Worker apps. Covers the full flow — build-time version stamp, /api/version endpoint, version-check hook, update banner UI, Service Worker unregister + caches.delete() + hard reload. Load when adding PWA install, Service Worker registration, update prompts, or cache-invalidation flows.
---

# PWA Update Flow (Service Worker + Version Check)

A full working pattern for PWAs that: ships updates to users already running the installed app, shows a non-intrusive "update available" banner, and cleanly wipes old caches before reloading. No libraries — ~120 lines of code total.

## Why not `vite-plugin-pwa` or Workbox?

Both are fine tools but they:
- Generate opaque runtime code you can't easily debug.
- Couple the cache strategy to build config rather than keeping it in one readable file.
- Overfit to SPA shells and make custom update UX awkward.

For apps with simple caching needs (static assets cache-first, HTML network-first, API never cached), a hand-written 50-line SW is clearer and more maintainable.

## Architecture

```
┌──────────────────┐     build-time        ┌──────────────────┐
│   vite.config    │ ──── inject ──────▶   │ __APP_VERSION__  │
└──────────────────┘                        └──────────────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                   ┌──────────────────┐   ┌──────────────────┐  ┌──────────────────┐
                   │ /api/version GET │   │ localStorage key │  │ service worker   │
                   │ returns {version}│   │ "app_version"    │  │ cache name       │
                   └──────────────────┘   └──────────────────┘  └──────────────────┘
                              │                     │
                              └─────────┬───────────┘
                                        ▼
                              ┌──────────────────┐
                              │ useVersionCheck  │ ◀── polls on mount
                              └──────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  update banner   │ ◀── user taps
                              └──────────────────┘
                                        │
                                        ▼
                              ┌────────────────────────────────┐
                              │ 1. sw.update()                 │
                              │ 2. caches.keys + caches.delete │
                              │ 3. clear localStorage version  │
                              │ 4. window.location.reload()    │
                              └────────────────────────────────┘
```

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

Base-36 timestamp gives monotonic, short, URL-safe IDs without git dependency. If you want git SHA instead: `execSync('git rev-parse --short HEAD').toString().trim()`.

Declare the global for TypeScript in any file that uses it:

```ts
declare const __APP_VERSION__: string
```

## Part 2: `/api/version` endpoint

Trivial — returns the same compile-time constant that the client already has:

```ts
// src/app/api/version/route.ts
declare const __APP_VERSION__: string

export function GET() {
  return Response.json({ version: __APP_VERSION__ })
}
```

**Key insight**: the client's bundled JS has version X baked in. When the server redeploys with version Y, `/api/version` returns Y while the client's constant is still X → mismatch detected. No separate version file needed, no manual bumping.

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

- **Seed `localStorage` on first visit, don't set `hasUpdate`.** First-load users have no baseline to compare against — skip the banner until the *second* visit after an update ships.
- **Two-step flow**: `prepare()` runs the cache wipe, shows a progress animation, then `reload()` is a separate user action. Don't auto-reload — users lose in-progress form input.
- **`import.meta.env.DEV` guard**: dev server has hot reload, no need for update banners.
- **Failure is silent**: if `/api/version` is unreachable (offline, API down), don't show a stale banner or an error toast.

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
- The banner lives inline in the page content, not as a fixed toast — respects the user's scroll position.
- The overlay only appears *after* the user opts in via `prepare()`. It's explanatory, not interruptive.
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
2. **Network-first for HTML.** Ensures users always see the freshest entry point. Falls back to the cached root on offline so the app shell still loads.
3. **Cache-first for hashed assets.** Vite's bundled JS/CSS have content hashes in the filename, so once cached, they never go stale — the old hash just stops being referenced.

### Why `skipWaiting()` + `clients.claim()`?

Without them, a new SW sits in "waiting" state until every tab closes — users get stuck on the old version for days. This pair activates the new SW on next page load, which pairs perfectly with the "Reload" button in `useVersionCheck`.

### Bumping `CACHE_NAME`

When you change cache strategy or want to force-evict everything, bump the version in the filename (`myapp-v2` → `myapp-v3`). The `activate` handler automatically deletes all other caches. Otherwise leave it alone — the content-hashed asset filenames naturally handle cache busting.

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

iOS Safari requires all four of `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, and a `theme-color` meta. Missing any one of these degrades the installed experience.

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

## Anti-patterns to avoid

- ❌ **Caching API responses in the SW.** Leads to stale data bugs that are hard to reproduce.
- ❌ **Auto-reloading when an update is detected.** Users lose in-progress form input and get whiplashed.
- ❌ **Polling `/api/version` every N seconds.** Mount-only check is plenty — users will remount via navigation.
- ❌ **Registering the SW inside a React `useEffect`.** Delays activation by one hydration cycle and races with the first navigation.
- ❌ **Using a module SW (`type: 'module'`) unless you need it.** Browser support and caching semantics are trickier; a classic SW is simpler and ubiquitous.
- ❌ **Hard-coding the version string in source.** Use a build-time `define` so every build gets a unique id automatically.
- ❌ **Using Workbox / `vite-plugin-pwa` for simple needs.** Generated runtime code is hard to debug and overkill for 50 lines of hand-written logic.
- ❌ **Showing the update banner on first load.** Seed `localStorage` without setting `hasUpdate` — there's no old version to compare against yet.
- ❌ **Missing `self.clients.claim()`.** The new SW won't take over existing tabs, making the update banner feel like a lie.

## Testing the update flow locally

1. `bun run build && bun run preview` (or deploy).
2. Open the app. `localStorage.getItem('app_version')` is now set.
3. `bun run build` again — timestamp changes, `__APP_VERSION__` bumps.
4. Refresh the tab *without* cleaning — the banner should appear.
5. Tap it → overlay → reload → new version loads.
6. DevTools → Application → Cache Storage: only the new cache name remains.

## Bootstrap checklist

1. `vite.config.ts` — add `define: { __APP_VERSION__: JSON.stringify(Date.now().toString(36)) }`.
2. Create `src/app/api/version/route.ts` (or equivalent) returning `{ version: __APP_VERSION__ }`.
3. Create `src/lib/use-version-check.ts` — copy the hook verbatim, adjust dev guard if needed.
4. Create `public/sw.js` — copy the SW verbatim, replace `CACHE_NAME`.
5. Create `public/manifest.json` — adjust colors, icons, name.
6. Add the inline SW registration + manifest/theme meta tags to `<head>`.
7. Add the update banner component wherever the app's landing view lives.
8. Build, preview, verify the flow end-to-end before shipping.
