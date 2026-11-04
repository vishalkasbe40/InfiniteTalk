# ADR 0004 — Test database policies with Vitest + `pg` against a Supabase shim

- Status: **Accepted** (reversible implementation decision)
- Date: 2026-11-04

## Context
The architecture planned pgTAP tests run with `supabase test db`. That requires the Supabase CLI
and Docker. Neither is available in the cloud development environment, and both make CI slower.
The security model (RLS, column grants, definer functions, the `aal2` requirement) still needs strong,
automated tests from the first migration onwards.

## Decision
- DB tests live in `supabase/tests/*.test.ts` and run with Vitest and the `pg` driver against any disposable PostgreSQL 16.
- `supabase/tests/shim/supabase-shim.sql` recreates the parts of Supabase that our SQL depends on:
  the `anon`/`authenticated`/`service_role` roles, `auth.users`, `auth.uid()`/`auth.jwt()` reading the
  `request.jwt.claims` setting (the same mechanism PostgREST uses), and **Supabase's default grants on `public`**.
  That last point matters most: it proves our migrations revoke what Supabase grants by default.
- Each test runs in a rolled-back transaction and switches roles with `SET LOCAL ROLE`, as PostgREST does per request.
- `schema-guards.test.ts` holds generic checks that cover every future migration automatically:
  - RLS is enabled on every public table;
  - `anon` has no table privileges;
  - `authenticated` has no table-level write privileges;
  - only `api_*` functions are executable by `authenticated`, and none by `anon`;
  - every SECURITY DEFINER function pins `search_path`.
- CI runs the same suite against a `postgres:16` service container.

## Consequences
- Fast (under 1 s) and runs anywhere Postgres runs.
- **Risk:** the shim may drift from real Supabase (GoTrue, PostgREST and the platform's own grants aren't exercised).
  **Mitigation (brought forward to M1-13):** CI job `supabase-stack` runs the same suite against a real
  `supabase start` stack (`DB_TEST_TARGET=supabase`, no shim), plus `supabase/tests-stack/` smoke tests through
  GoTrue and PostgREST. Revisit this ADR if the two runs disagree.
- The schema-guard tests deliberately fail when a new table or function needs an exception. Exceptions must be
  allow-listed in the test with a comment, which makes them visible in review.
