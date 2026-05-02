---
name: pr-review-fix
description: Triage PR review comments (Copilot, reviewers) on the current branch's PR, let the user pick which to address via AskUserQuestion, apply fixes, and push.
user_invocable: true
---

# /pr-review-fix — PR Review Triage and Fix

Fetch open review comments on the PR for the current branch, surface them, ask the user which to act on, apply the fixes, and push.

## Instructions

### Step 1: Locate the PR

Run:

```sh
gh pr list --head "$(git branch --show-current)" --json number,title,url
```

If multiple PRs match, use AskUserQuestion to let the user pick.
If none, abort and tell the user there is no open PR for the current branch.

### Step 2: Fetch review comments

Pull both line comments and top-level review bodies:

```sh
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/<PR>/comments" --paginate
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/<PR>/reviews" --paginate
```

Filter out resolved / outdated comments where possible. Group by author (Copilot vs human) and by file.

### Step 3: Present and select

Summarize each comment as a one-line entry: `path:line — author — gist`.
Use **AskUserQuestion** with `multiSelect: true` so the user can tick each comment they want addressed. Do not just dump the list as text — always go through AskUserQuestion when selection is required (project rule).

For comments touching policy / settings (e.g. `.claude/settings.local.json`, `wrangler.toml` secrets), surface the trade-off in the option description so the user can decide.

### Step 4: Apply fixes

For each selected comment:

1. Read the referenced file at the cited line.
2. Apply the smallest fix that addresses the reviewer's concern.
3. Run `bun tsc --noEmit` and `bun biome check --write` after each batch.
4. If a comment is not actionable (style preference, vague), ask the user for direction via AskUserQuestion rather than guessing.

### Step 5: Commit and push

- Stage only the files you modified (no `git add -A`).
- Use commitlint format: `fix: address Copilot PR review comments` or scope-specific (`fix(gantt): ...`).
- One commit per logical group is fine; do not amend.
- `git push` after committing.

### Step 6: Reply on PR (optional)

Ask the user if they want to reply to each addressed comment with a short note. If yes, use:

```sh
gh api "repos/<owner>/<repo>/pulls/<PR>/comments/<comment_id>/replies" -f body="<message>"
```

## Notes

- **Never** dismiss / resolve comments programmatically without explicit user OK.
- For `.claude/settings.local.json` style policy comments, default to "skip" unless user chooses otherwise — these usually reflect intentional local config.
- If GitHub MCP is configured (see `.mcp.json`), prefer MCP tools over `gh api` for structured access.
- Respect CLAUDE.md: always confirm with the user before modifying based on review feedback.
