---
name: code-refactor
description: Audit and refactor non-UI code (API endpoints, Prisma queries, Zod schemas, utilities, workers, tests) for reuse, separation of concerns, type safety, and dead code removal. Does NOT touch React components or JSX — use /ui-refactor for those.
user_invocable: true
---

# /code-refactor — Non-UI Code Refactoring Command

Audit and improve existing non-UI code (server, schemas, lib, hooks, workers, tests) based on structural quality criteria. Delegates execution to the `refactor` agent and the `qa` agent.

## Scope

### In Scope
- `src/app/server/**` — Hono routes, middleware
- `schemas/**` — Zod DTOs
- `prisma/**` — schema, migrations
- `src/lib/**` — non-presentational utilities
- `src/hooks/**` — data / query hooks (no JSX)
- `workers/**` — Cloudflare Worker entrypoints
- `tests/**` — unit / integration tests

### Out of Scope (refer user to `/ui-refactor`)
- `src/components/**`
- `src/app/routes/**` JSX bodies

## Instructions

### Step 1: Determine Scope

If the user specified a target, use it. Otherwise use the `AskUserQuestion` tool to present these options:
- A specific module (e.g. `src/app/server/recordings`)
- A specific file (e.g. `schemas/anime.dto.ts`)
- A feature slice across server + schemas + lib
- All non-UI code (full audit — warn that this is large)

Do NOT list options as plain text — always use `AskUserQuestion` for selectable choices.

### Step 2: Load Context

Read project conventions:
- `CLAUDE.md` for repo-wide rules
- `.claude/agents/backend.md` for backend conventions
- `.claude/agents/refactor.md` for refactor agent's scope and criteria
- The target files themselves
- Adjacent files that import / are imported by the target (use `grep` to find call sites)

### Step 3: Audit

Evaluate against these criteria:

**Reuse / Duplication**
- Same logic appearing in multiple files
- Near-duplicate functions that could be unified
- Repeated Zod schema fragments that should be extracted

**Separation of Concerns**
- Hono route handlers doing too much (validation + business logic + DB + transform)
- Business logic mixed with HTTP concerns
- DB queries scattered instead of centralized per feature

**Type Safety**
- `any` / unsafe `as` casts
- Missing Zod validation at boundaries (request / response / external API input)
- DTO naming: must be `schemas/<feature>.dto.ts`, PascalCase exports

**Database**
- N+1 query patterns
- Missing `select` projections (over-fetching)
- Raw SQL where Prisma would work
- Schema changes that bypassed migrations

**Dead Code**
- Unused exports / imports / files
- Commented-out blocks
- `_unused` parameters or backwards-compat shims with no current consumer

**Conventions**
- File placement matches `CLAUDE.md` rules
- DTO field naming matches source data casing (don't force camelCase on snake_case sources)
- No `npm` / `npx` / `yarn` references in scripts

### Step 4: Report

Present findings in Japanese as a structured report:

```
## コードリファクタリングレポート: [対象]

### 問題点
| # | 重要度 | 箇所 | 問題 | 改善案 |
|---|--------|------|------|--------|
| 1 | 高/中/低 | file:line | ... | ... |

### 推奨変更 (優先順)
1. [高] ...
2. [中] ...
3. [低] ...

### 推定コスト: [S/M/L/XL]

### スコープ外検知
- (UI 領域の問題があれば `/ui-refactor` を案内)
```

### Step 5: Ask for Approval

Use the `AskUserQuestion` tool with options: 全て実行 / 一部を選択 / キャンセル.

Do NOT proceed without explicit approval. Do NOT ask via plain text.

### Step 6: Execute (after approval)

Delegate via the Agent tool:

1. Launch the `refactor` agent with:
   - Specific file paths to modify
   - Each approved change as a discrete instruction
   - Constraint reminder: do not touch `src/components/**` or route JSX
2. After the refactor agent reports completion, launch the `qa` agent to:
   - Run `bunx tsc -b --noEmit`
   - Run `bunx biome check src/` (fix with `--write` where safe)
   - Commit in commitlint format: `refactor(<scope>): <description>`

### Step 7: Verify

- Confirm tests still pass if a test suite exists for the touched area:
  ```sh
  bun test <path>
  ```
- For DB-touching changes: verify `bunx prisma migrate status` is clean and no raw SQL was applied
- Report final diff summary and any deferred items

## Constraints

- Use `bun` / `bunx`, never `npm` / `npx` / `yarn`
- Do not edit `src/components/**` or `src/app/routes/**` JSX bodies — refer the user to `/ui-refactor`
- DB schema changes must go through Prisma migrations
- Don't add features or invent abstractions; refactor for what's currently used
- All inter-agent prompts in English; user-facing reports in Japanese