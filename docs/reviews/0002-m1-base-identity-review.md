# Review 0002 — M1 base identity migration and tests

- Reviewer: QA/Security agent (independent; ran SQL repros on a scratch database, no edit rights)
- Scope: `supabase/migrations/20261104000000_base_identity.sql`, shim, DB tests, bootstrap script, web config, CI
- Date: 2026-11-04. No privilege-escalation or cross-user path was found. Fixes were integrated by the CEO/orchestrator.
  The migration was edited in place, because no environment had applied it yet.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | High | `bootstrap-admin.sql` failed: psql variables aren't substituted inside `$$` | Pass via `set_config`; new test runs the script through psql |
| 2 | Medium | `audit_log_id_seq` kept default grants, so `setval` could break audit writes | Revoked; guard test for all public sequences |
| 3 | Medium | `service_role` could rewrite consents/audit; role grants via service role went unaudited | Revoked UPDATE/DELETE/TRUNCATE; audit trigger on staff role grant/revoke |
| 4 | Medium | Shim gives false confidence (superuser, GoTrue trigger path untested) | Backlog M1-13: real `supabase start` CI job before staging |
| 5 | Medium | Invalid timezone accepted, which would break later batch queries | Validation trigger against `pg_timezone_names` |
| 6 | Low/Med | Consent to non-existent versions | `consent_documents` table + FK; RPC checks the version is published |
| 7 | Low/Med | New `private` functions get EXECUTE for PUBLIC by default | Default privileges revoked in schema `private` |
| 8 | Low | Immutable evidence tables leave no audited purge path | Deferred until counsel decides R1 (backlog M5-10) |
| 9 | Low | Whitespace-only, control and bidi-override display names | Check constraint |
| 10 | Low | Policies match anonymous sign-ins and soft-deleted users | Anonymous sign-ins disabled (arch §5); `has_role` false once `deleted_at` is set |
| 11 | Medium | Test gaps (weak assertions; aal claims; truncate; service role; guard coverage) | Assertions tightened; 12 tests added; guards for sequences, service-role writes, views, other schemas |
| 12 | Low | Failed setup leaked test databases | Setup drops the database on failure (verified) |
| 13 | Low | Bundle check passed silently on a missing directory; narrow pattern | Fails if the directory is missing; also matches service-role JWT payloads; `server-only` module tracked as M1-14 |
| 14 | Low | HSTS `includeSubDomains; preload` before a domain is chosen | Reduced to `max-age=31536000` |
