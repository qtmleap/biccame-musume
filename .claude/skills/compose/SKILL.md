---
name: compose
description: Assemble an Agent Team as leader and run the plan → approve → execute workflow
user_invocable: true
---

# /compose — Agent Teams Workflow

You are the **leader agent** for this project. Follow the five phases below strictly, in order.

## Phase 1: Hearing

- Ask the user what they want to achieve. Keep the question brief (1-2 sentences).
- If the user's message already specifies a task, skip the question and use that task directly.

## Phase 2: Planning

Once you have the user's goal:

### 1. Check available agents

Agents are defined under `.claude/agents/`:

- **frontend** — React + TailwindCSS + Shadcn/ui + TanStack Router UI implementation
- **backend** — Hono API endpoints, Prisma schemas, Cloudflare Workers logic
- **qa** — Type checking, lint, format fixes, commitlint-format commits

### 2. Collect subtask proposals

- Launch each relevant agent via the Agent tool in **Plan mode**, with the prompt: "Propose the subtasks you should own for this goal as a bullet list (do not write code)"
- Launch these agents in parallel for efficiency.

### 3. Consolidate into a plan document

Merge the proposals and save a plan document to `docs/plans/` using this template:

```markdown
# Work Plan: [Title]
Date: [ISO 8601]

## Goal
[User's goal]

## Tasks

### [Agent Name]
- [ ] Subtask 1
- [ ] Subtask 2

### [Agent Name]
- [ ] Subtask 1

## Execution Order
1. Parallel: [task group]
2. Sequential: [task group]

## Deliverables
- [file path]: [description]

## Risks / Notes
- [known issues]
```

## Phase 3: Approval

- Present the plan to the user and ask: "Shall I proceed with this plan?"
- Incorporate any changes the user requests.
- **Do NOT proceed to Phase 4 without explicit user approval.**

## Phase 4: Execution

After approval:

1. Create a task list with TodoWrite.
2. Launch agents via the Agent tool, in parallel where possible.
   - Give each agent specific file paths, changes, and constraints.
   - Frontend and backend share API contracts (Zod schemas): define the schemas first, then run frontend and backend in parallel.
3. If the work involves API schema changes:
   - Define Zod schemas in `schemas/*.dto.ts` (PascalCase) **before** implementation.
   - Backend implements Hono endpoints matching the schema.
   - Frontend consumes the API via the Zodios client.
4. If the work involves DB schema changes:
   - Use the Prisma migration workflow (see `.claude/skills/prisma-d1.md`).
   - Never modify D1 directly with raw SQL.
5. Review each agent's results.
6. Launch the **qa** agent to run the type check and lint below, fix any issues, and commit:
   ```sh
   bunx tsc -b --noEmit        # type check
   bunx biome check src/        # lint + format
   ```

## Phase 5: Report

After all tasks are complete:

1. Update the checkboxes in the plan document.
2. Update related spec documents if they exist.
3. Report results and remaining issues to the user.

## Constraints

- **DON'T** guess or speculate — say "unknown" when unsure.
- **DO** verify the full blast radius before making changes.
- Runtime is **Bun**: use `bun` / `bunx`. **Never** use `npm` / `npx` / `yarn`.
- Commit messages follow **commitlint** format: `type(scope): description`.
- Zod schemas go in `schemas/*.dto.ts` (PascalCase).
- TanStack Router routes use a directory-based layout (`routes/feature/index.tsx`).
- Documentation goes in `docs/`.
- **Language**: All inter-agent communication (prompts and responses) MUST be in English. Replies to the user MUST always be in Japanese (日本語).
