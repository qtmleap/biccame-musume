---
name: vinext-frontend
description: Frontend architecture reference for React 19 + Vinext (Vite App Router) + TanStack Query + Zodios + shadcn/ui + react-hook-form projects running on Cloudflare Workers. Load when writing React components, forms, API clients, or data fetching code in this stack.
---

# Vinext Frontend Stack

Patterns extracted from a production React 19 + Vinext + Cloudflare Workers codebase. Copy the patterns, not the app-specific code.

## Stack

| Layer | Choice |
|---|---|
| Build / router | [Vinext](https://github.com/vinxi/vinext) on Vite 8 — Next.js-compatible App Router |
| UI framework | React 19 (RSC via Vinext) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (New York style) |
| Data fetching | TanStack Query v5 |
| HTTP client | **Zodios** with shared Zod schemas (single source of truth) |
| Forms | `react-hook-form` + `@hookform/resolvers/zod` |
| Global state | Jotai (only for cross-page UI state) |
| Animation | `motion/react-m` with `LazyMotion + domAnimation` |
| Icons | `lucide-react` |
| Toasts | `sonner` |
| Package manager | **Bun only** — never `npm`/`yarn`/`pnpm` |
| Linter / formatter | **Biome** (no ESLint, no Prettier) |

## Directory layout

```
src/
├─ app/                        # Vinext App Router
│  ├─ layout.tsx                # Root — wraps with <Providers>
│  ├─ page.tsx                  # Home route
│  ├─ <feature>/page.tsx
│  └─ api/<feature>/route.ts    # API handlers (server-side)
├─ components/
│  ├─ ui/                       # shadcn primitives — NEVER edit directly
│  ├─ providers.tsx             # All client providers in one tree
│  └─ <feature>-form.tsx        # kebab-case feature components
├─ lib/
│  ├─ api.ts                    # Zodios client singleton
│  ├─ api-contract.ts           # makeApi([...]) — THE contract
│  ├─ schema.ts                 # Zod input (form) schemas
│  ├─ atoms.ts                  # Jotai atoms
│  ├─ utils.ts                  # cn() helper
│  └─ use-*.ts                  # Custom hooks
└─ index.css                     # Tailwind + global styles
schemas/
└─ *.dto.ts                      # Zod output (response) schemas — PascalCase
```

Path alias: `@/*` → `./src/*`. `../../schemas/*` for response DTOs kept outside `src/`.

## Core pattern: Zodios as the API contract

**The single highest-value pattern in this stack.** One file defines all endpoints, types flow automatically to both client callsites and server handlers.

```ts
// src/lib/api-contract.ts
import { makeApi } from '@zodios/core'
import { z } from 'zod'
import { FoodRowSchema } from '../../schemas/Food.dto'
import { foodSchema } from './schema'

export const apiDefinition = makeApi([
  {
    method: 'get',
    path: '/foods',
    alias: 'listFoods',
    response: z.array(FoodRowSchema),
    parameters: [
      { name: 'q', type: 'Query', schema: z.string().optional() },
      { name: 'limit', type: 'Query', schema: z.number().optional() }
    ]
  },
  {
    method: 'post',
    path: '/foods',
    alias: 'createFood',
    response: FoodRowSchema,
    parameters: [{ name: 'body', type: 'Body', schema: foodSchema }]
  }
])
```

```ts
// src/lib/api.ts — singleton client
import { Zodios, type ZodiosPlugin } from '@zodios/core'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { apiDefinition } from './api-contract'

const errorToastPlugin: ZodiosPlugin = {
  name: 'error-toast',
  error: async (_api, _config, error) => {
    if (error instanceof AxiosError) {
      const status = error.response?.status
      const data = error.response?.data as { error?: unknown } | undefined
      const serverMessage = typeof data?.error === 'string' ? data.error : undefined
      toast.error(serverMessage ?? `Request failed (${status})`)
    } else {
      toast.error(error.message || 'Request failed')
    }
    throw error
  }
}

export const api = new Zodios('/api', apiDefinition)
api.use(errorToastPlugin)
```

Usage from components — fully typed via the `alias`:

```ts
api.listFoods({ queries: { q: 'chicken', limit: 10 } })  // → FoodRow[]
api.createFood({ name: 'rice', calories: 250 })          // → FoodRow
```

### Two schema locations — intentional split

- **`src/lib/schema.ts`** — *input* schemas (form data). Loose: `z.number().min(0).default(0)`. Shared between RHF resolver and server parse.
- **`schemas/*.dto.ts`** — *output* schemas (server responses). Strict. Kept outside `src/` to stay portable and avoid app imports. Naming: `PascalCase.dto.ts`, `<Name>RowSchema` + `type <Name>Row = z.infer<typeof ...>`.

### Never write a `ZodiosPlugin` as an axios interceptor

Use the Zodios plugin API (`error`, `request`, `response` hooks) instead of wrapping a custom `axios.create()` instance. Keeps error handling scoped to the client.

## TanStack Query patterns

```tsx
// Providers.tsx
const [queryClient] = useState(
  () => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } }
  })
)
```

- **Query key convention**: `[<feature>, ...subkey]` — e.g. `['foods', 'frequent']`, `['meals', date]`.
- **Invalidate in `onSuccess`** of mutations:
  ```ts
  useMutation({
    mutationFn: (data) => api.createMeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      form.reset()
      toast.success('Saved')
    }
  })
  ```
- Let the error-toast plugin handle failure toasts — don't add `onError` unless you need custom behavior.

## Forms — react-hook-form + Zod

**Every form follows this exact pattern.** No ad-hoc `useState` + `fetch`.

```tsx
const form = useForm<FoodInput>({
  resolver: zodResolver(foodSchema) as never,  // "as never" sidesteps RHF/Zod generic friction
  mode: 'onBlur',                               // validate when focus leaves a field
  defaultValues: {
    name: '',
    calories: undefined as unknown as number,   // see number-input gotcha below
    protein: undefined as unknown as number,
    serving: '1 serving'
  }
})
```

Use shadcn/ui `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormMessage>` — they wire up `aria-describedby`, error state, and labels automatically.

### Number input gotcha (CRITICAL — bites every new dev)

```tsx
// ❌ BAD — user can't clear the "0"
<Input
  type='number'
  {...field}
  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 0)}
/>

// ✅ GOOD
<Input
  type='number'
  {...field}
  value={field.value ?? ''}
  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
/>
```

Why:
1. `value={field.value ?? ''}` — shows empty string when `undefined`. Without it React warns controlled→uncontrolled.
2. onChange maps empty → `undefined`, **never** back to `0`. Otherwise the default `0` resurrects on every keystroke and the field is impossible to clear.
3. `defaultValues` should be `undefined` for number fields. Use `z.number().default(0)` in the schema to backfill on submit.

### Always `mode: 'onBlur'`

Validate when focus leaves a field, not only on submit. Gives immediate feedback without being noisy on every keystroke.

## Styling conventions

- **Tailwind v4** via `@tailwindcss/vite` — no `tailwind.config.js`. Config lives in `index.css` with `@theme`.
- **Never use template-literal conditional classes.** Always use `cn()`:
  ```tsx
  // ❌ BAD
  className={`rounded ${selected ? 'bg-primary' : 'bg-muted'}`}
  // ✅ GOOD — cn() from @/lib/utils: twMerge(clsx(...))
  className={cn('rounded', selected ? 'bg-primary' : 'bg-muted')}
  ```
- **Never edit shadcn/ui files in `src/components/ui/`.** Override via `className` at the usage site. If structural changes are needed, wrap it.
- Add shadcn components with `bunx --bun shadcn@latest add <name>`.

## `cn()` utility

```ts
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## Animation with motion

```tsx
import * as m from 'motion/react-m'   // tree-shaken import path

<m.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
/>
```

### SSR hydration gotcha

`initial={{ opacity: 0 }}` leaves elements invisible during SSR until hydration finishes.

1. `src/index.css`:
   ```css
   html:not([data-hydrated]) [data-motion-initial] { opacity: 1 !important; }
   ```
2. In `Providers`:
   ```tsx
   useEffect(() => { document.documentElement.dataset.hydrated = '' }, [])
   ```
3. Provide a `useSkipAnimation()` hook returning `true` on first client render so you can write `initial={skipAnimation ? false : {...}}`.

## Providers ordering (matters)

```tsx
<AuthProvider>                               {/* Firebase auth listener */}
  <LazyMotion features={domAnimation} strict>
    <JotaiProvider>                           {/* Inside auth so atoms reset on logout */}
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </JotaiProvider>
  </LazyMotion>
</AuthProvider>
```

## Global state guidance

- **Server state → TanStack Query.** Never put API responses in Jotai or Context.
- **Cross-page UI state → Jotai.** E.g. selected date, open sheets that survive navigation.
- **Local-only state → `useState`.** Don't reach for a global store just to share between siblings.

## TypeScript conventions

- `"strict": true`. Run `bunx tsc --noEmit` on every change.
- Exclude shadcn files from strict checks:
  ```jsonc
  // tsconfig.json
  "exclude": ["src/components/ui/**/*.tsx"]
  ```
- Prefer `as never` over `as any` when casting around RHF/Zod generics.

## Biome config (copy verbatim)

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.4.11/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "none"
    }
  },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

Always run `bunx biome check --write` after edits.

## Bootstrap checklist when adopting this stack

1. `bun install` with the dependencies listed above.
2. Copy `biome.json`, `tsconfig.json`, `vite.config.ts`.
3. Create `src/lib/utils.ts` (`cn()`), `src/lib/api-contract.ts`, `src/lib/api.ts`, `src/lib/schema.ts`.
4. Create `schemas/` directory outside `src/` for response DTOs.
5. Add shadcn primitives with `bunx --bun shadcn@latest init` then `add <component>`.
6. Mirror `src/components/providers.tsx` ordering.
7. Use one form (e.g. `food-form.tsx`) as the template for all other forms.
8. Add `mode: 'onBlur'` and the number-input gotcha fix to every `useForm` call from day one.

## Anti-patterns to avoid

- ❌ Hand-written fetch wrappers when Zodios can generate them.
- ❌ Editing files in `src/components/ui/`.
- ❌ Template-literal conditional class strings.
- ❌ `onChange` that maps empty string to `0` on number inputs.
- ❌ Storing server data in Jotai or React Context.
- ❌ `mode: 'onSubmit'` (the default) — use `'onBlur'`.
- ❌ Mixing `npm`/`yarn` with Bun.
