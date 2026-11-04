# ADR 0003 — Privileged database writes go through narrow RPCs

- Status: **Accepted** (low-risk, reversible implementation decision within the agreed architecture)
- Date: 2026-11-03
- Source: Security review 0001, finding 5–6

## Context
Supabase exposes every table and every `public` function to the `authenticated` role through PostgREST.
RLS is row-level only, so it can't stop a student from rewriting columns in their own rows (scores,
`is_correct`, mastery, quota counters, `deleted_at`). If request handlers use the service-role
client instead, RLS is bypassed and every handler becomes a privilege boundary.

## Decision
1. Student routes use only the **user-scoped** client. The service-role client is restricted to
   named server-only modules (cron, deletion job, admin bootstrap) and marked `import 'server-only'`.
2. On every table marked `own-ro` in `data-model.md`, `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon`.
   Tables that allow limited student edits get `GRANT UPDATE (col, …)` for the listed columns only.
3. Business writes (submit attempt, answer item, set task status, accept plan, consume tutor turn, record
   non-evidentiary event, onboarding goal) are **SECURITY DEFINER** functions that:
   - live in the `private` schema (not exposed by PostgREST) with `EXECUTE` revoked from `anon, authenticated`;
   - are reached through thin `public.api_*` wrappers that take **no** `student_id`, `is_correct`, score or
     mastery parameters and derive the user from `auth.uid()`;
   - set `search_path = ''` and fully qualify every object;
   - validate argument ranges and the ownership of every referenced id.
4. Each exposed wrapper has DB policy tests (ADR 0004) for: anon denied, cross-user ids rejected, forged arguments rejected.

## Consequences
- Slightly more SQL to write. In return, the security boundary sits in one reviewable place, and
  domain logic that must run in TypeScript (planner, mastery) runs in server code that then calls a single write RPC.
- The `packages/db` typed helpers wrap these RPCs, so app code never calls `.from(table).update()` for `own-ro` tables.
  A lint rule or grep check enforces this.
