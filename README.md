# ExamSaathi AI

A personalised preparation platform for Indian government exams. It combines a diagnostic assessment,
a realistic syllabus-mapped study plan, and an AI teacher grounded in reviewed content. The first
target is MPSC (Maharashtra), with English and Marathi.

> **Status:** Milestone 1 in progress. The app scaffold, CI and base identity schema exist; there are no student features yet.

## Local development
Requirements: Node 22, pnpm 10 (`corepack enable`), and a disposable PostgreSQL 16 for the DB tests.

```bash
pnpm install
pnpm dev --filter @examsaathi/web        # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test && pnpm build
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres pnpm test:db
```

`pnpm test:db` creates a throwaway database on that server, applies `supabase/tests/shim/supabase-shim.sql`
and every migration in `supabase/migrations/`, runs the policy tests, then drops the database
([ADR 0004](docs/decisions/0004-db-policy-testing.md)). Never point it at a real project.
Copy `.env.example` to `apps/web/.env.local` and fill in the values from `supabase start` (or the
staging project). End-to-end tests (`apps/web/e2e`, Playwright) need a running Supabase stack;
CI runs them in the `supabase-stack` job.

## Putting it online (staging)
Step-by-step: `docs/runbooks/staging-setup.md` (Supabase database via the **Deploy database** GitHub
action, hosting on Vercel, connecting the two).

## Becoming the first admin (founder, one time)
1. In the Supabase dashboard: **Table Editor → `beta_invites` → Insert row**, enter your own email, save.
2. Open the app's `/signup` page, sign up with that email, click the link in the email, choose a
   password and accept the documents.
3. In the Supabase dashboard: **SQL Editor → New query**, paste the line below with your email, and
   press **Run** (this is recorded in the activity log automatically):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where lower(email) = lower('you@example.com');
   ```
4. **Straight away** (within 15 minutes of clicking the email link in step 2; otherwise log in again
   with "Email me a log-in link"), open **Admin area** on your dashboard. It asks you to set up an
   authenticator app (Google Authenticator, Microsoft Authenticator, …): scan the QR code and type
   the 6-digit code. After that, admin pages ask for a fresh code at least every 12 hours.
5. Open **Admin → Two-step security** and add a **backup authenticator** (a second device).
6. Turn on two-step verification for your **Supabase dashboard account** too (Account → Security).
   Lost every device? See `docs/runbooks/admin-lost-authenticator.md`.

## Inviting beta students (founder)
In the app: **Admin area → Invitations**, type the student's email (and an optional note), press
**Add invitation**, then tell the student to sign up at `/signup` with that email. Each invitation
works once; unused ones can be cancelled. Every add/cancel appears in **Activity log**.

## Exam and syllabus data (founder / content reviewer)
Local development and CI use `supabase/seed.sql`: clearly labelled **sample data**, not the official
syllabus. Real content is entered in the app: **Admin area → Exams and syllabus**.
1. **Sources first:** add the official notification and the official syllabus document (title, link,
   dates). Send each for review and approve it after checking it.
2. Build the tree: exam group → exam → stage → paper → syllabus version → subject → topic.
   Every new item is a **draft**. Exam facts (duration, marks, negative marking) need a cited source.
3. **Review and approve top-down:** a child can only be approved after its parent. Only approve
   after checking every fact against the cited source. Approved items can't be edited; retire and
   recreate instead. Students only ever see approved items.
4. Every create, edit and status change is in the **Activity log** (self-approvals are flagged,
   which is expected while you are the only reviewer).

## Hosted Supabase project settings (one-time, founder)
- Authentication → Sign In / Providers: anonymous sign-ins **off**, "Allow new users to sign up" **off**,
  email provider **on**, "Confirm email" **on**, minimum password length **8**.
- Authentication → URL Configuration: Site URL = the app's public address; add `<site>/auth/confirm`
  to Redirect URLs.
- Authentication → Emails: paste the three templates from `supabase/templates/`
  (Confirm signup, Magic link, Reset password) so email links go to `/auth/confirm`.
- Authentication → Multi-factor: TOTP **on** (needed for admin accounts).
- API settings: keep only `public` (and `graphql_public`) as exposed schemas; never expose `private`.
- **Authentication → Emails → SMTP: set up a custom email sender** (e.g. a transactional email service
  with SPF/DKIM on your domain). Supabase's built-in sender only delivers to your own team and is
  heavily rate-limited, so students would not receive their links. Required before the beta.
- Authentication → Rate limits: review the email and sign-in limits for the beta size.
- Authentication → Providers → Email: turn on "Secure password change".

## Start here
| Doc | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Vision, principles, guardrails, agent roster, definition of done (source of truth) |
| [`docs/product-requirements.md`](docs/product-requirements.md) | MVP scope, user journey, acceptance criteria, assumptions |
| [`docs/architecture.md`](docs/architecture.md) | System shape, modules, planner/mastery/tutor design, security model |
| [`docs/data-model.md`](docs/data-model.md) | Tables, RLS rules, integrity rules |
| [`docs/backlog.md`](docs/backlog.md) | Prioritised milestones and tasks |
| [`docs/decisions/`](docs/decisions/) | Architecture decision records |
| [`docs/reviews/`](docs/reviews/) | Independent QA/security reviews |

## Planned stack
Next.js + TypeScript (strict), Supabase (Postgres, Auth, RLS, pgvector), pnpm workspaces,
Vitest, Playwright. See `docs/architecture.md`.

## Legacy code
This repository was previously a fork of InfiniteTalk (talking-video generation). That code
lives unchanged under [`legacy/infinitetalk/`](legacy/infinitetalk/) under its original Apache-2.0
licence. ExamSaathi does not use it. See [ADR 0002](docs/decisions/0002-repository-takeover.md).

## Licence
The licence for the ExamSaathi code is not yet decided (ADR 0001, D9). Until then, all rights are reserved.
