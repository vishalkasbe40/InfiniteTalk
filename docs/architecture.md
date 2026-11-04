# ExamSaathi AI — Architecture (MVP)

Status: **Draft v0.1 — Milestone 0**. Related: [`product-requirements.md`](product-requirements.md),
[`data-model.md`](data-model.md), [`decisions/`](decisions/).

## 1. Shape: a modular monolith on managed services

```text
 Browser (PWA, Next.js client components)
        │  HTTPS, Supabase session cookie (httpOnly)
        ▼
 Next.js app (App Router, TypeScript strict) ── hosted on a managed Next.js host
   ├─ app/(student)/…   server components + server actions
   ├─ app/(admin)/…     server components + server actions (role-gated)
   ├─ app/api/…         route handlers: tutor stream, cron hooks, health
   └─ packages/* imported as plain TS modules (no network boundary)
        │                             │
        ▼                             ▼
 Supabase (Postgres + Auth +     AI provider(s) via packages/ai adapter
 RLS + pgvector + Storage)       (server-only; keys never reach the client)
```

There is no separate backend service in the MVP. A small Python/FastAPI service is allowed later
only if a need appears that TypeScript can't handle well (e.g. IRT calibration jobs).

## 2. Repository layout (target)

```text
/
├── CLAUDE.md, README.md, .env.example
├── docs/                      PRD, architecture, data model, ADRs, backlog, runbooks
├── apps/web/                  Next.js app (UI + server actions + route handlers)
├── packages/
│   ├── domain/                Pure TS: planner, mastery, scoring, recommendation rules
│   ├── ai/                    Provider adapter, tool registry, prompts, router, metering
│   ├── db/                    Generated Supabase types, typed query helpers
│   ├── shared/                zod schemas, i18n keys, constants
│   └── ui/                    Accessible components (only if reuse emerges; start inside apps/web)
├── supabase/
│   ├── migrations/            SQL migrations (forward + documented rollback)
│   ├── seed/                  Clearly fictional seed data
│   ├── scripts/               One-off, founder-run SQL (e.g. bootstrap-admin.sql)
│   └── tests/                 RLS / policy tests (Vitest + pg, Supabase shim)
├── tests/e2e/                 Playwright journeys
└── legacy/infinitetalk/       Previous repo contents, untouched (see ADR 0002)
```

Tooling: pnpm workspaces, TypeScript strict, ESLint, Prettier, Vitest (unit), Vitest + `pg` against a
Supabase shim for policies ([ADR 0004](decisions/0004-db-policy-testing.md)), Playwright (E2E). CI runs
format, typecheck, lint, unit tests, DB tests on a Postgres 16 service, then build.

## 3. Module boundaries

| Module | Responsibility | Must not |
|---|---|---|
| `packages/domain` | Deterministic logic: planner, mastery estimator, diagnostic selection, scoring, recommendation rules. Pure functions with full unit tests. | Import DB clients, HTTP clients or AI SDKs. |
| `packages/ai` | `LLMProvider` interface, model router, tool registry, prompt templates, guardrail post-checks, token/cost metering. | Be imported by client components. Run SQL directly; it calls tool handlers only. |
| `packages/db` | Typed access, with two clients: **user-scoped** (RLS enforced, used by default) and **service-role** (only for cron/admin jobs in explicitly named modules). | Expose the service-role client to request handlers for student routes. |
| `apps/web` | UI, server actions, route handlers, input validation (zod), session handling. | Hold business rules that only exist in the browser. |

## 4. Key flows

### 4.1 Diagnostic → baseline
1. Server builds a diagnostic form: about 35 items from `questions` where `review_status = 'approved'`,
   stratified by topic weight and spread across difficulty 1–5 (`domain/diagnostic.selectItems`, seeded for reproducibility).
2. Each answer is stored as an `attempt_responses` row (choice, server-clamped ms, confidence) through a narrow RPC.
   For diagnostics and mocks, `is_correct` is **not** computed until submit. For practice it is computed per item when the item is answered, and the item is then locked.
3. Timing is enforced by the server: responses after `started_at + duration + 60 s grace` are rejected and the attempt auto-submits.
   `response_ms` from the client is untrusted, so it is clamped to the server-observed window.
4. On submit, the server grades the attempt, emits `learning_events`, and `domain/mastery.estimate` updates each topic's
   posterior (see 4.3) and writes `topic_mastery`. **Mastery changes only from server-graded responses.**
5. The UI shows each topic as a band (weak / developing / strong / **not enough evidence**), never a precise %.

### 4.2 Study plan (deterministic)
`domain/planner.generatePlan(input) → PlanDraft` is a pure function:
- **Inputs:** syllabus topics (weight, prerequisites, estimated learning minutes), mastery
  estimates, availability (minutes per weekday, rest days), start date, target date, policy constants.
- **Algorithm:**
  1. Compute capacity = Σ available minutes up to the target date − buffer (12 %) − mock slots
     (one per week in the last 8 weeks, one per fortnight before that).
  2. Topic need = learn_minutes × (1 − mastery_mean) + practice_minutes; priority =
     syllabus_weight × gap × (1 + uncertainty).
  3. Topologically order by prerequisites, then place by priority into days (greedy bin fill),
     never exceeding a day's minutes.
  4. Insert spaced revision tasks at +1, +7 and +21 days after each learn task, if capacity allows.
  5. If need > capacity, return `feasibility: 'insufficient'` with ranked options
     (extend the date by X weeks, add Y min/day, focus on the top-K weighted topics) instead of an overstuffed plan.
- **Outputs:** tasks with date, type, topic, estimated minutes and reason code.
- The LLM may only *explain* a `PlanDraft` in natural language; it never edits dates.
- Accepting a plan creates an immutable `study_plan_versions` row. Changes create a new version with a `change_reason`.

### 4.3 Mastery estimation
Per (student, topic) Beta-Bernoulli posterior, starting from the prior Beta(1, 1):
- A correct response adds `w` to α and an incorrect one adds `w` to β, where `w` depends on difficulty
  (harder correct counts more; easier incorrect counts more) and confidence ("guess" + correct counts as 0.5).
- Mean = α/(α+β); uncertainty = posterior SD. Evidence older than 60 days decays by ×0.5.
- Bands: "not enough evidence" if effective n < 3 or SD > 0.2; otherwise weak < 0.45 ≤ developing < 0.7 ≤ strong.
- This is a documented heuristic, labelled "estimate" in the UI. IRT is a later option once enough response data exists.

### 4.4 Missed tasks → re-plan proposal
A nightly job (Supabase cron → route handler with a shared secret) marks overdue tasks `missed`.
At the next visit the student sees a supportive check-in ("Want to adjust this week?"). The planner
then produces a proposal diff. Nothing changes until the student accepts it. A task deferred twice
is flagged for review rather than pushed again.

### 4.5 AI tutor
```text
client ──POST /api/tutor (session_id, mode, message)──▶ route handler
   1. auth (Supabase session) + zod validation + rate limit + quota check
   2. build bounded context: student profile summary, topic mastery, plan slice (≤ ~2k tokens)
   3. router picks model tier (see 4.6) → provider.stream(messages, tools)
   4. tool calls → handlers in packages/ai/tools/* run with the *user-scoped* DB client
   5. post-check: if factual-exam claim w/o citation from tool results → append "unverified" notice
   6. stream to client; write ai_usage row (tokens, model, latency, cost, feature)
```
Tools available in the MVP: `get_student_profile`, `get_active_exam_and_syllabus`, `get_study_plan`,
`get_topic_learning_history`, `search_approved_content`, `get_question_and_answer`,
`record_learning_event`, `create_practice_set`, `propose_plan_adjustment` (creates a
*proposal*, never an active change). `request_human_teacher_recommendation` is deferred to Phase 2.

Tool arguments are validated with zod. A tool never takes a `student_id` from the model; the student
is always the authenticated user. Retrieved content is passed to the model as delimited data with an
instruction that it is reference material, not instructions (prompt-injection mitigation). The
approved corpus is admin-curated, which reduces but does not remove that risk.

**Tutor hard rules (from security review 0001):**
- **Timed-attempt lock.** While the user has an `in_progress` attempt of kind `mock` or `diagnostic`, the tutor
  endpoint refuses turns ("Finish or pause your test first"), and practice-set creation excludes that attempt's items.
  This is enforced in the route handler and again inside each tool handler.
- **Held-out pools.** Questions tagged `pool = 'assessment'` are never returned by `get_question_and_answer`,
  `create_practice_set` or retrieval. *(The size of the held-out pool is a founder decision: R4.)*
- **No model-authored evidence.** `record_learning_event` accepts only non-evidentiary kinds
  (`tutor_explained`, `tutor_hint_given`) with zero mastery weight. In "quiz me" mode the student's answer is
  graded by the same server grading path as practice, never by the model's verdict.
- **Bounds per turn.** Student message ≤ 2,000 characters; ≤ 3 tool iterations per turn; ≤ 6k input tokens and the tier's
  output cap; one in-flight turn per user (row lock on `ai_quotas`); `create_practice_set` ≤ 20 items, limited to the
  student's own syllabus version.
- **Citations from the server only.** Citations are rendered from tool-result metadata held by the server. Any
  `source_id` the model mentions that was not returned by a tool in this turn is dropped. Factual exam claims without
  a citation get the "cannot verify" label, applied before the segment is shown (factual segments are buffered rather than streamed raw).
- **Safe rendering.** All markdown (content and LLM output) is rendered with raw HTML disabled and run through a sanitiser.
  Images are not rendered from LLM output, and external links are shown only if they match a URL in the source register.
- The tutor UI tells students not to share personal details, because messages are processed by a third-party AI provider.

Transcripts: tutor messages are kept for 30 days (for support and quality review, with student
access and deletion) and then **deleted**. Structured learning facts come from `learning_events`, not
from transcripts, so no extra LLM pass is needed. *Founder to confirm the 30-day period (D8).*

### 4.6 Model routing and cost controls
| Tier | Use | Default limits |
|---|---|---|
| `small` | Explaining a plan, short hints, classifying intent | max 600 output tokens |
| `standard` | Tutor explanations and quizzing | max 1,200 output tokens |
| `strong` | Reserved: answer evaluation, admin content drafting | admin/offline only in MVP |

- Per-user default quota: 40 tutor turns/day and 15 turns/session, enforced server-side before the provider call.
- Global budget: `AI_MONTHLY_BUDGET_INR`. Before each provider call the worst-case cost of the turn is
  **reserved**, and it is settled with actual tokens afterwards. At 80 % an admin alert fires; at 95 % tutor turns are
  refused with a friendly message (headroom for in-flight turns), while practice and plan keep working.
- Cache: approved-topic explanations that contain no personal data may be cached by (topic_id, language, content_version).
- The provider is chosen by an env var behind `LLMProvider`; the specific vendor is a founder decision.

### 4.7 Retrieval
- `content_chunks` hold the text of approved `content_items` (and, for admin/offline use only, question explanations), with a
  `tsvector` (English + `simple` config for Marathi) and a `vector` embedding (pgvector).
- Hybrid search: full-text rank + vector similarity, always filtered to `status = 'approved'`, the student's
  exam/syllabus version and language (with English fallback). Each chunk carries `source_id` for citation.
- **The student-facing retrieval function never returns `owner_type = 'question_answer'` chunks.** Answer
  explanations reach students only through `reveal_answer` (§6). A DB policy test and an eval case assert this.
- Re-embedding is triggered when content is approved or changed; old chunks are deactivated, not mutated.

## 5. Authentication and roles
- Supabase Auth (email + password, magic link) with the **PKCE** flow. Sessions use httpOnly cookies via `@supabase/ssr`.
- **Sign-up only through a server action** that checks the beta invite allowlist and CAPTCHA, creates the user, and
  writes the three consent rows. Magic link is sign-in only (`shouldCreateUser: false`).
- **Consent middleware:** every app route except auth and legal pages redirects to a consent screen unless the user
  has granted rows for the *current* privacy, terms and 18+ versions. This also handles re-consent when a version changes.
- Supabase Auth rate limits are configured; email confirmation is required; sign-up, sign-in and reset responses
  are generic (no account enumeration); a custom SMTP sender has SPF/DKIM. Redirect URLs are allow-listed, and any
  `next` parameter must be a relative path.
- Roles live in the `user_roles` table (`student`, `content_reviewer`, `admin`), never in `user_metadata`.
  A Postgres function `has_role(role)` (SECURITY DEFINER, fixed `search_path`) backs the RLS policies.
  For `admin` and `content_reviewer` it **also requires `auth.jwt()->>'aal' = 'aal2'`** (MFA), so a session
  with a stolen password alone is denied.
- Admin routes check role and AAL server-side in the layout **and** in each server action. RLS is the backstop.
- The first admin is bootstrapped by a one-off, audited SQL script run by the founder. It is not exposed through the UI.

## 6. Security model
- **RLS on every table in `public`.** Student-owned tables use `student_id = auth.uid()`. Content tables
  allow `select` to authenticated users only where `status = 'approved'`; write access needs `has_role('admin')`
  or `has_role('content_reviewer')` with specific transitions.
- **Cross-user denial tests** (DB policy tests, ADR 0004) for every student-owned table (student A can't select, insert, update or delete B's rows).
- **Privileged writes** follow [ADR 0003](decisions/0003-privileged-db-functions.md): student tables marked
  `own-ro` get no direct `insert/update/delete` grants for `authenticated`. Writes go through narrow RPCs that
  derive the user from `auth.uid()`; internals live in a non-exposed `private` schema with `EXECUTE` revoked.
  Tables that allow limited student edits use column-level `UPDATE` grants.
- **Answer keys:** `question_answers` has **no** select policy for students. The only path is
  `reveal_answer(attempt_item_id)`, which checks that the attempt belongs to `auth.uid()` and requires
  either a `submitted` mock/diagnostic attempt or an answered (and now locked) practice item.
  `questions` is not directly readable either: items reach students only through an RPC that returns their own
  attempt items, so the bank can't be downloaded. `questions.options` has a check constraint allowing only `{id, text}`.
  An E2E test inspects network payloads for answer fields across mock, practice and tutor.
- Input validation: zod at every server action and route handler; Postgres constraints as a second layer.
- Rate limits: per-user and per-IP on auth, tutor and submit endpoints (Postgres-backed token bucket in the MVP,
  so no extra service is needed).
- Headers: strict CSP (no inline scripts except Next nonce; `img-src 'self'` plus Supabase storage; tight `connect-src`),
  HSTS, `frame-ancestors 'none'`, Referrer-Policy.
- Cron: `CRON_SECRET` is sent in a header and compared in constant time.
- The service-role client module is marked `import 'server-only'`; a CI step fails if the key name appears in client bundles.
- CSRF: server actions use Next's origin checks; route handlers check `Origin`. Cookies are `SameSite=Lax`.
- SSRF: the server makes no user-supplied URL fetches in the MVP. Source URLs are stored as text and rendered as links only.
- Secrets live in host env vars only; `.env.example` documents names. The service-role key is never in a `NEXT_PUBLIC_*` var.
- Audit log: `audit_log` rows (actor, action, entity, before/after hash, at) for content status changes,
  role grants, user data exports and deletions. Rows are insert-only (no update/delete policies).
- Logs must not contain message bodies, emails or tokens. Tutor transcripts live only in their table under RLS.

## 7. Environments and deployment
| Env | Purpose | Data |
|---|---|---|
| local | `supabase start` + `next dev` | fictional seed only |
| preview | per-PR deploy against a staging Supabase project | fictional seed only |
| production | closed beta | real users. **Requires founder approval to deploy.** |

Backups: Supabase daily backups plus PITR on production (paid tier, a founder cost decision).
A runbook covers restore drills before the beta. Migrations are forward-only SQL with a documented
manual rollback note in each file header.

Planned env vars (`.env.example` will be added with the app scaffold in M1):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL_SMALL`, `AI_MODEL_STANDARD`, `AI_MONTHLY_BUDGET_INR`,
`CRON_SECRET`, `APP_BASE_URL`, `EMAIL_FROM`.

## 8. Telemetry
- Product events go to the `analytics_events` table (server-emitted; `user_ref` = HMAC of the user id with a
  server secret, treated as personal data anyway; no free text).
  Taxonomy: `onboarding_step_completed`, `diagnostic_started|completed`, `plan_generated|accepted|declined`,
  `task_completed|missed`, `practice_item_answered`, `mock_started|completed`, `tutor_turn`,
  `replan_proposed|accepted|declined`, `content_error_reported`.
- AI cost: `ai_usage` (user, feature, model, input/output tokens, cost estimate, latency, error).
- Errors: a hosted error tracker with PII scrubbing (the vendor is chosen at M5).

## 9. Threat model summary (top risks)
| Threat | Mitigation |
|---|---|
| Cross-user data access via missing RLS | RLS default-deny, DB policy tests per table **and per exposed function**, CI gate |
| Direct PostgREST writes forging scores, mastery or quota | ADR 0003: no direct writes on `own-ro` tables, column grants, `private` schema |
| Answer-key leakage before submit | No student select on keys or the bank, submit-gated `reveal_answer`, tutor lock during timed attempts, retrieval excludes answer chunks, held-out pool; E2E payload test |
| Account farming / email bombing | Invite allowlist, CAPTCHA, Supabase Auth rate limits, generic responses |
| Prompt injection through content or student input | Tools are scoped to the auth user, delimited retrieval, no write tools beyond events/proposals |
| AI cost abuse | Server quotas, rate limits, global kill-switch, metering before and after the call |
| Admin account takeover | MFA for admins, audit log, minimal admin count |
| Fabricated exam facts | Retrieval-only factual claims, "cannot verify" fallback, eval set in CI (M3) |
| Leaking PII in logs/analytics | No free-text analytics; log scrubbing; review in M5 |
