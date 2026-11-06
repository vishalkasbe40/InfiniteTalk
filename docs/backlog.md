# ExamSaathi AI — Prioritised implementation backlog

Status: Draft v0.1. Sizes: **S** ≈ ≤ ½ day, **M** ≈ 1–2 days, **L** ≈ 3–5 days of focused solo + AI-assisted work.
Estimates are rough planning aids, not commitments. Owners refer to the roster roles in `CLAUDE.md` §11.
Every task inherits the Definition of Done in `CLAUDE.md` §13.

## Milestone 0 — Repository and plan
| ID | Task | Owner | Size | Status |
|---|---|---|---|---|
| M0-1 | Move InfiniteTalk to `legacy/`, add CLAUDE.md | CEO | S | Done |
| M0-2 | PRD, architecture, data model, ADR 0001/0002, backlog | CEO/PM/Architect | M | Done (draft) |
| M0-3 | Independent QA/Security review of the docs, findings resolved or recorded | QA | S | Done: [review 0001](reviews/0001-m0-security-review.md); fixes in docs, not yet implemented |
| M0-4 | Founder decisions D1–D10 and R1–R8 (ADR 0001) | Founder | — | Done: defaults accepted 2026-11-04 (counsel items open) |

## Milestone 1 — Student foundation (≈ 2–3 weeks)
| ID | Task | Owner | Size | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| M1-1 | Scaffold: pnpm workspace, Next.js app, TS strict, ESLint/Prettier, Vitest, `.env.example` (Playwright moved to M1-4) | DevOps/FE | M | M0-4 (D7) | `pnpm typecheck lint test build` pass in CI | **Done (local); CI not yet run on GitHub** |
| M1-2 | CI workflow (GitHub Actions): format, typecheck, lint, unit, DB tests (Postgres service), build, bundle secret check | DevOps | S | M1-1 | Green on PR | **Written; not yet run on GitHub** |
| M1-3 | Supabase local setup, base migration: profiles, user_roles, `has_role()`, consents, notification_preferences, audit_log; ADR 0003 grant pattern + `private` schema | Backend | M | M1-1 | DB tests: cross-user denial, no self role grant, no direct writes on own-ro tables | **Done (local, 29 tests)** |
| M1-4 | Auth flows: invite-only sign-up server action (allowlist, CAPTCHA, 18+/privacy/terms consent), magic-link sign-in (`shouldCreateUser:false`), reset, sign-out, PKCE, consent middleware, Supabase Auth rate limits | FE/Backend | M | M1-3 | E2E (adds Playwright): no account without consent; generic errors; consent re-prompt on version bump | **Done**: review 0003 fixed; 14 E2E journeys green on CI (real Supabase + email). CAPTCHA split to M1-15 |
| M1-5 | i18n framework (en/mr UI strings), Devanagari font, language switcher | FE | S | M1-1 | All M1 screens switch language |
| M1-6 | Taxonomy migration: exam_families → topics, prerequisites, sources, syllabus_versions | Backend/Content | M | M1-3 | RLS approved-read tests | **Done** (migration `20261105000200`; approved-read RLS; prerequisite cycle check) |
| M1-7 | Admin shell: role + `aal2` gated layout and actions, TOTP enrolment, first-admin bootstrap script, audit-logged actions | FE/Backend | M | M1-3 | Non-admin and `aal1` admin denied (DB tests + E2E); audit rows written | **Done**: `/admin` (role + aal2), TOTP set-up/verify at `/admin/mfa`, invitations + activity log; first admin via SQL editor (README) | Review 0005 fixed (fresh-code 12 h, first set-up via email link, backup authenticators, attempt limit, runbook). |
| M1-8 | Admin CRUD: exams, syllabus versions, subjects, topics, sources (audited RPCs; enforce topic `weight_note`; lock during prerequisite edits, review 0004 #11) | FE | M | M1-6, M1-7 | Status workflow enforced | **Done**: invitations; content screens for sources + exam tree with draft → review → approve → retire (audited RPCs, parent-approved rule, weight-note rule). Topic prerequisites + subtopics UI: M2-0b |
| M1-9 | Onboarding (≤ 6 steps): paper, language, target date, weekly minutes, rest days | FE | M | M1-4, M1-6 | ≤ 3 min; "why we ask" on each step | **Done**: one page, 4 questions with "why we ask"; `api_save_onboarding` RPC |
| M1-10 | Student dashboard first-run state → "Start diagnostic" | FE | S | M1-9 | Loading/empty/error states | **Done**: first-run card → onboarding; goal summary afterwards |
| M1-11 | Fictional seed: GS-I taxonomy skeleton marked `[FICTIONAL SEED]` | Content | S | M1-6 | No real personal data | **Done**: `supabase/seed.sql`, labelled "(sample data)", no official facts |
| M1-12 | Analytics event writer + onboarding events | Backend | S | M1-3 | Allow-listed props only |
| M1-13 | CI job running the DB suite on a real `supabase start` stack (no shim) + one GoTrue sign-up and PostgREST RLS smoke test (ADR 0004 mitigation, brought forward by review 0002) | DevOps | M | M1-3 | Must pass before M1-4 is deployed to staging | **Done**: green on CI |
| M1-14 | Service-role client module with `import 'server-only'` | Backend | S | M1-4 | Part of M1-4 | **Done** (`apps/web/lib/supabase/admin.ts`) |
| M1-15 | CAPTCHA (Turnstile) on sign-up/log-in/reset (deferred from M1-4: invite allowlist already blocks mass sign-up; needs founder keys) | FE/Backend | S | M1-4 | Required before public sign-up; recommended before beta |
| M1-16 | Per-user/IP rate limits on auth server actions; forward client IP so Supabase's per-IP auth limits don't throttle all users behind our server (trust the forwarded header only with a secret, review 0003 #9) | Backend | M | M1-4 | Before beta (M5 gate) |
| M1-17 | Eligibility notice links to an approved `official_notification` source for the chosen exam family (no hard-coded URLs) | FE/Content | S | M1-8 | review 0004 #10 |

## Milestone 2 — Diagnostic and plan (≈ 3 weeks)
| ID | Task | Owner | Size | Depends |
|---|---|---|---|---|
| M2-0 | **Rule:** every student content query (diagnostic, topics, practice, tutor retrieval) starts from the pinned `student_exam_goals.syllabus_version_id`, never from rows that are merely `approved` (review 0004 #4) | Architect | S | — |
| M2-0b | Admin UI for topic prerequisites and subtopics (DB supports both; lock during prerequisite edits) | FE/Backend | S | M1-8 |
| M2-1 | Questions + question_answers + attempts schema, `reveal_answer()`, submit function | Backend | L | M1 |
| M2-2 | Admin question editor with metadata, review status, PYQ verification rules | FE/Content | M | M2-1 |
| M2-3 | Content: first ~120 reviewed GS-I MCQs (source register filled) | Content/Founder | L | M2-2, D6 |
| M2-4 | `domain/diagnostic.selectItems` (stratified, seeded) + tests | AI/Learning | M | M2-1 |
| M2-5 | Diagnostic UI: pause/resume, timer per item, confidence tap, slow-network handling | FE | M | M2-4 |
| M2-6 | `domain/mastery` Beta estimator + bands + tests; `topic_mastery` writer | AI/Learning | M | M2-1 |
| M2-7 | Baseline screen (bands, "not enough evidence", explanation) | FE | S | M2-6 |
| M2-8 | `domain/planner.generatePlan` + feasibility options + property tests (never exceeds availability, rest days free, deadline respected; PRD §6a) | AI/Learning | L | M2-6 |
| M2-9 | Plan versions/tasks schema; review, edit and accept UI; each plan version snapshots the goal + weekly availability it was built from (review 0004 #8) | Backend/FE | M | M2-8 |
| M2-10 | QA: E2E diagnostic → plan; network payload test for answer-key leakage; server timer/auto-submit test | QA | M | M2-5, M2-9 |

## Milestone 3 — Learning loop (≈ 3–4 weeks)
| ID | Task | Owner | Size | Depends |
|---|---|---|---|---|
| M3-1 | Content items, translations, review queue (admin) | Backend/FE | M | M2 |
| M3-2 | Topic learning page with sources and a "report an error" button | FE | S | M3-1 |
| M3-3 | Practice sets (topic / weakness / mistakes) + explanations | FE/Backend | M | M2-1 |
| M3-4 | Mistake notebook + attempt history | FE | M | M3-3 |
| M3-5 | Timed mock test (server-timed, auto-submit) | FE/Backend | M | M2-1 |
| M3-6 | `packages/ai`: provider adapter, router, metering, quota `consume_tutor_turn()` | AI | M | D4, D5 |
| M3-7 | Retrieval: content_chunks, embeddings job, hybrid search function | AI/Backend | M | M3-1 |
| M3-8 | Tutor tools + guardrail post-check + tutor UI (modes, citations, quota messages); daily session from today's plan, fitted to today's minutes, level- and deadline-aware (PRD §6a) | AI/FE | L | M3-6, M3-7 |
| M3-9 | AI eval set (≥ 50 cases: grounding, refusal, "cannot verify", citation forgery, prompt injection, no answer leaks; tutor locked during mock) in CI | AI/QA | M | M3-8 |
| M3-10 | Learning-event emission across practice, tutor and content views | Backend | S | M3-3 |

## Milestone 4 — Adaptation and follow-up (≈ 2 weeks)
| ID | Task | Owner | Size |
|---|---|---|---|
| M4-1 | Progress dashboard (planned vs done, topic trends, labelled estimates) | FE | M |
| M4-2 | Rule-based next-step recommendation with reason codes | AI/Learning | S |
| M4-3 | Nightly missed-task job + supportive check-in + re-plan proposal flow | Backend/FE | M |
| M4-4 | In-app notifications + preferences + quiet hours; opt-in email reminders | Backend/FE | M |
| M4-5 | Admin cost/usage view + budget alerts + kill-switch | Backend/FE | S |

## Milestone 5 — Closed-beta readiness (≈ 2 weeks + content time)
| ID | Task | Owner | Size |
|---|---|---|---|
| M5-1 | Content to ~300 MCQs / ~60 explainers, all reviewed | Content | L |
| M5-2 | Data export + deletion workflow | Backend | M |
| M5-3 | Security review (RLS matrix, headers, rate limits, dependency audit) | QA | M |
| M5-4 | **Gate:** error monitoring (PII-scrubbed), backups/PITR, restore drill, incident + breach-notification runbook | DevOps | M |
| M5-8 | **Gate:** email reminders have one-click unsubscribe + `List-Unsubscribe`; opt-out E2E test | Backend | S |
| M5-9 | **Gate:** DB policy test matrix covers every user-linked table and every exposed function; deletion job E2E test | QA | M |
| M5-10 | Retention cron jobs per DM §8a, including an audited, owner-only purge path for `audit_log`/`consents` once counsel decides R1 (review 0002 #8) | Backend | S |
| M5-11 | **Gate:** custom SMTP sender (SPF/DKIM) on the hosted project; hosted auth rate limits reviewed (review 0003 #8) | Founder/DevOps | S |
| M5-5 | Privacy notice and terms drafts for **counsel review** | Founder/Legal | — |
| M5-6 | Accessibility + low-end Android manual pass | QA/FE | S |
| M5-7 | Beta onboarding of 20–50 users (founder approval to deploy) | Founder | — |

**Rough total to closed beta:** ≈ 12–15 weeks of engineering, run in parallel with content authoring.
Content review throughput is the critical path.
