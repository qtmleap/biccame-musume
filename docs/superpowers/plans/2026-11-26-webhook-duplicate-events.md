# Webhook Duplicate Events Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development.

**Goal:** Hold likely reposts that differ in date without blocking unrelated giveaways.

**Architecture:** Keep the legacy exact check, separate D1 scope from the matching rules, and use a D1 write-time scope guard to detect registrations that raced the last read. Retry against live candidates instead of reimplementing the matcher in SQL.

**Tech Stack:** TypeScript, D1, Bun and Miniflare.

**Spec:** Approved option 2. Preserve manual registration and update/end linking. Near matches require identity evidence beyond category and generic conditions. Do not merge or clean up existing events.

- [x] Add failing local D1 tests for a one-day shift, a distinct sibling item, and concurrent candidates with different dates.
- [x] Separate SQL candidate lookup from exact and near matching. Use JST days and allow explicit overlapping periods.
- [x] Move reservation and guarded automatic registration out of the candidate orchestrator. Preserve human overrides and lease checks.
- [x] Run focused integration regressions, typecheck and the repository test command.
