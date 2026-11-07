# ADR 0005 — All government exams, eligibility matching, and a draft-only content agent

- Status: **Accepted** (founder decisions, 2026-11-07)
- Date: 2026-11-07

## Context
The MVP plan (ADR 0001, PRD §3) started with one exam: MPSC Rajyaseva Prelims GS Paper I. On
2026-11-07 the founder decided that:
1. The product covers **all Indian government exams** a student is eligible for, with **full
   preparation** (not only discovery), rather than MPSC only.
2. Onboarding collects **whatever eligibility needs** ("all the student's details") so the platform
   can show which exams the student may apply for.
3. A **Claude Code content agent** finds official syllabus and notification documents and keeps them
   current, **weekly**, instead of the founder typing every exam tree by hand.

CLAUDE.md requires traceable official sources (§3.2), human review before students see content
(§3.4, §15), minimal and justified personal data (§3.6), and founder approval for these changes (§15).

## Decision
**Content pipeline (built in this change):**
- The agent writes **bundles** (`content/imports/<ref>.json`, format in `content/README.md`) in a
  **pull request**. Only official documents on allow-listed hosts (`content/official-domains.json`:
  `*.gov.in`, `*.nic.in`, and named exam bodies such as IBPS and SBI) may be cited, each with a SHA-256
  fingerprint and retrieval date. CI validates every bundle and imports it into a throwaway database.
- After merge, the **Import content drafts** workflow calls `private.import_content_bundle(jsonb)` via
  the Supabase Management API. The function creates **drafts only**, never approves, never edits or
  deletes existing rows, requires an official source for exam facts, syllabus versions and eligibility
  rules, and audits every created row as `content.import` with the bundle ref and no human actor.
  It is executable only by the database owner (not by `anon`, `authenticated` or `service_role`).
- A human with an admin or content-reviewer role and two-step verification approves top-down in
  **Admin → Exams and syllabus**. Approving agent-created rows is recorded as `self_approved` (no
  human author), which keeps the pending second-reviewer decision (review 0006 #5) visible.
- **Eligibility rules** (`public.eligibility_rules`) hang under an exam: minimum education level,
  education details, age range and reference date, category age relaxations, domicile, other
  conditions, validity dates and an official source. Same workflow and approval rules as the tree.

**Agent runs:** a scheduled Claude Code session runs weekly using `docs/runbooks/content-agent.md`, in
the "InfiniteTalk (ExamSaathi)" cloud environment, whose network allows only the listed official
exam-body hosts (plus package registries). It opens at most two pull requests per run and never merges.

**Scope (planned, not built here):**
- Student eligibility profile in onboarding: highest education and stream, date of birth, domicile
  state; **optional** category, disability (PwBD) and ex-serviceman status, each with "why we ask" and
  a "prefer not to say" option. Category and disability are sensitive personal data: optional, used
  only for matching, never shown to teachers or other students, deletable, and flagged for counsel
  review (R-items) before the beta.
- Eligibility finder: lists exams whose **approved** rules the student appears to meet, always with
  the official notification link and "check the latest notification before applying". It shows
  "appears eligible" / "check details", never a guarantee.
- Full preparation for every exam needs reviewed questions and explainers per syllabus. Review
  capacity, not software, is the limit; exams are opened to students one by one as their content is
  approved.

## Consequences
- The founder no longer types exam trees, but **must review every draft**; the review queue becomes
  the main operating task. A second reviewer (review 0006 #5) becomes more important.
- Supersedes ADR 0001's single-exam MVP scope for content; the learning loop (diagnostic → plan →
  tutor) is still built once and reused for each exam.
- New risks: wrong eligibility shown as fact (mitigated by official-only sources, human approval,
  "appears eligible" wording, validity dates); a compromised or mistaken agent bundle (mitigated by
  pull-request review, drafts-only import, no edit/delete, audit trail); sensitive personal data
  (mitigated by optional fields, minimal use, counsel review).
- Changing `official-domains.json` or the environment's allowed hosts is a founder decision.
