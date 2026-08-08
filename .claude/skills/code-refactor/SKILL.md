---
name: code-refactor
description: Audit and refactor non-UI code (API endpoints, Prisma queries, Zod schemas, utilities, workers, tests) for reuse, separation of concerns, type safety, and dead code removal. Does NOT touch React components or JSX — use /ui-refactor for those.
user_invocable: true
---

# /code-refactor — Non-UI Code Refactoring Command

Audit and improve existing non-UI code (server, schemas, lib, hooks, workers, tests) against structural quality criteria. Execution is delegated to the `refactor` agent and the `qa` agent.

## Scope

### In Scope

| Path | Contents |
|------|----------|
| `src/app/server/**` | Hono routes, middleware |
| `schemas/**` | Zod DTOs |
| `prisma/**` | schema, migrations |
| `src/lib/**` | non-presentational utilities |
| `src/hooks/**` | data / query hooks (no JSX) |
| `workers/**` | Cloudflare Worker entrypoints |
| `tests/**` | unit / integration tests |

### Out of Scope

Refer the user to `/ui-refactor` for:

- `src/components/**`
- JSX bodies in `src/app/routes/**`

## Workflow

### Step 1: Determine Scope

- If the user specified a target, use it.
- Otherwise, use the `AskUserQuestion` tool to present these options:
  - A specific module (e.g. `src/app/server/recordings`)
  - A specific file (e.g. `schemas/anime.dto.ts`)
  - A feature slice across server + schemas + lib
  - All non-UI code (full audit — warn that this is large)

DON'T: list options as plain text. Always use `AskUserQuestion` for selectable choices.

### Step 2: Load Context

Read, in this order of relevance:

- `CLAUDE.md` — repo-wide rules
- `.claude/agents/backend.md` — backend conventions
- `.claude/agents/refactor.md` — refactor agent's scope and criteria
- The target files themselves
- Adjacent files that import, or are imported by, the target (use `grep` to find call sites)

### Step 3: Audit

Evaluate the target against all six criteria:

**1. Reuse / Duplication**
- Same logic appearing in multiple files
- Near-duplicate functions that could be unified
- Repeated Zod schema fragments that should be extracted

**2. Separation of Concerns**
- Hono route handlers doing too much (validation + business logic + DB + transform)
- Business logic mixed with HTTP concerns
- DB queries scattered instead of centralized per feature

**3. Type Safety**
- `any` / unsafe `as` casts
- Missing Zod validation at boundaries (request / response / external API input)
- DTO naming: must be `schemas/<feature>.dto.ts`, with PascalCase exports

**4. Database**
- N+1 query patterns
- Missing `select` projections (over-fetching)
- Raw SQL where Prisma would work
- Schema changes that bypassed migrations

**5. Dead Code**
- Unused exports / imports / files
- Commented-out blocks
- `_unused` parameters or backwards-compat shims with no current consumer

**6. Conventions**
- File placement matches `CLAUDE.md` rules
- DTO field naming matches source data casing (don't force camelCase on snake_case sources)
- No `npm` / `npx` / `yarn` references in scripts

### Step 4: Report

Present findings in Japanese, using this structure:

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

Use the `AskUserQuestion` tool with exactly these options: 全て実行 / 一部を選択 / キャンセル.

- DON'T: proceed without explicit approval.
- DON'T: ask via plain text.

### Step 6: Execute (only after approval)

Delegate via the Agent tool, in two stages:

1. Launch the `refactor` agent with:
   - Specific file paths to modify
   - Each approved change as a discrete instruction
   - Constraint reminder: do not touch `src/components/**` or route JSX
2. After the `refactor` agent reports completion, launch the `qa` agent to:
   - Run `bunx tsc -b --noEmit`
   - Run `bunx biome check src/` (fix with `--write` where safe)
   - Commit in commitlint format: `refactor(<scope>): <description>`

### Step 7: Verify

- If a test suite exists for the touched area, confirm tests still pass:
  ```sh
  bun test <path>
  ```
- For DB-touching changes: verify `bunx prisma migrate status` is clean and no raw SQL was applied.
- Report the final diff summary and any deferred items.

## Constraints

- DO: use `bun` / `bunx`. DON'T: use `npm` / `npx` / `yarn`.
- DON'T: edit `src/components/**` or JSX bodies in `src/app/routes/**` — refer the user to `/ui-refactor`.
- DO: route all DB schema changes through Prisma migrations.
- DON'T: add features or invent abstractions. Refactor only for what's currently used.
- DO: write all inter-agent prompts in English; write user-facing reports in Japanese.
