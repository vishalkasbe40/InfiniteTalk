# ExamSaathi AI — Product Requirements (MVP)

Status: **Draft v0.1 — Milestone 0**. Owner: CEO/orchestrator. Last updated: 2026-11-03.
Source of truth for vision and principles: [`CLAUDE.md`](../CLAUDE.md). This document narrows
that vision into a buildable MVP. Where they conflict, `CLAUDE.md` wins and this file must be fixed.

---

## 1. Problem and hypothesis

Aspirants for Maharashtra government exams prepare with generic content libraries,
coaching-class notes, and Telegram/WhatsApp groups. They get little personalised feedback
on *what to study next* and *why*.

**Launch hypothesis (unvalidated):** an MPSC aspirant who gets a diagnostic baseline,
a realistic syllabus-mapped plan, and grounded AI tutoring will (a) complete more planned
study and (b) show topic-level improvement on re-assessment, compared with their own
starting point. We measure this; we do not claim it.

## 2. Target user for the MVP

| Persona | Description | Why they matter |
|---|---|---|
| **Primary: "Priya", first-attempt MPSC aspirant** | 21–26, graduate, preparing for MPSC Rajyaseva Prelims (GS Paper I) on a mid-range Android phone, studies 2–4 h/day, prefers Marathi-English mix. | Largest segment; clear syllabus; the diagnostic → plan → practice loop helps immediately. |
| Secondary: "Rahul", working repeat aspirant | 26–32, employed, 1–2 h/day on weekdays, more at weekends, has attempted once. | Tests that the planner handles constrained availability. |
| Internal: Content admin (the founder at first) | Curates syllabus, questions, explanations; approves AI drafts. | Without a usable admin tool, nothing can be published safely. |

**Minors:** the MVP is **18+ only** (see ADR 0001). Under-18 support needs guardian
consent flows and is out of scope until legal review.

## 3. MVP scope: one exam, one stage, one loop

**Exam for the first loop:** MPSC State Services (Rajyaseva) Preliminary Examination —
General Studies Paper I. *Founder to confirm* (see §9). The data model supports other
exams, stages and papers; the MVP ships content for this one paper only.

**Languages:** UI in English and Marathi. Educational content starts in English plus
**reviewed** Marathi for the subset a human reviewer has approved. Content not yet reviewed
in Marathi falls back to English, with a visible label.

### 3.1 In scope (Milestones 1–4)

| # | Capability | Milestone |
|---|---|---|
| F1 | Email + password and email magic-link sign-up/sign-in, password reset, sign-out | M1 |
| F2 | Consent capture: privacy notice, terms, age confirmation (18+), versioned | M1 |
| F3 | Onboarding: exam → stage/paper, preferred language, target exam date, weekly study availability (hours per weekday), rest day(s) | M1 |
| F4 | Student dashboard (empty/first-run state → next action) | M1 |
| F5 | Admin: CRUD for exams, syllabus versions, subjects, topics, sources | M1 |
| F6 | Admin: question records with full metadata + review status | M2 |
| F7 | Diagnostic assessment (≈30–40 questions, mixed difficulty, topic-balanced), with confidence tap | M2 |
| F8 | Topic-level baseline showing estimate + uncertainty ("not enough evidence") | M2 |
| F9 | Deterministic study-plan generator; student reviews, edits availability/priorities, accepts | M2 |
| F10 | Immutable plan versions with change reasons | M2 |
| F11 | Topic learning page (approved explanation content + sources) | M3 |
| F12 | Practice sets (by topic, by weakness) with explanations | M3 |
| F13 | Timed mock test (one full-length GS-I-style mock built from approved items) | M3 |
| F14 | Attempt history + mistake notebook | M3 |
| F15 | AI tutor (bounded sessions): *explain*, *quiz me*, *revise*, *review my progress* — grounded in approved content, with citations | M3 |
| F16 | Learning events + mastery estimates per topic | M3 |
| F17 | Progress dashboard (planned vs done, topic trends, labelled estimates) | M4 |
| F18 | Rule-based next-step recommendation with a stated reason | M4 |
| F19 | Missed-task review → re-plan *proposal* the student must accept | M4 |
| F20 | In-app reminders + notification preferences (in-app and email only) | M4 |
| F21 | AI usage metering, per-user daily quota, cost log, admin cost view | M4 (metering from M3) |
| F22 | Admin content review queue for AI-drafted / imported content | M5 |
| F23 | Data export and account deletion request | M5 |

### 3.2 Explicitly out of the MVP

These follow `CLAUDE.md` §4, plus decisions made here:
- Human-teacher marketplace and payments (Phase 2). The AI may *say* that human help could
  be useful, but there is no booking flow yet. Also no fake "coming soon" upsells.
- Community (Phase 3), WhatsApp, voice (Phase 4).
- Paid subscriptions. The MVP runs as a **free closed beta** with quotas. Pricing is a founder decision.
- Hindi, other exams' content, Mains/answer-writing evaluation, current affairs feed.
- Native apps. The MVP is a responsive PWA; offline mode is limited to "view last-loaded plan".
- Phone-number/OTP auth (costs SMS money and needs DLT registration; revisit later).

## 4. Canonical MVP user journey and acceptance criteria

1. **Sign up.** The student enters an email and password, confirms they are 18+, and accepts
   the privacy notice and terms (versions recorded).
   *AC:* no account is created without all three; consent rows store version + timestamp.
2. **Onboard (≤ 6 screens, ≤ 3 minutes).** Exam → paper → language → target date →
   weekly hours → rest days. Every question shows a one-line "why we ask".
   *AC:* no education/eligibility data is requested in the MVP. Eligibility gets a static
   notice linking to the official MPSC notification page: "Check eligibility against the latest
   official notification; we do not determine eligibility."
3. **Diagnostic.** About 35 approved questions spread across GS-I topics, mixed difficulty, an optional
   "how sure are you?" (sure / unsure / guess), and response time captured. The student can pause and resume.
   *AC:* the engine reports per-topic evidence counts; topics with fewer than 3 answered items show
   "not enough evidence yet". There is no single headline "score out of 100" framed as readiness.
4. **Baseline.** The student sees strengths, gaps, uncertain topics, and a plain explanation that this is an initial estimate.
5. **Plan.** The deterministic planner builds weekly/daily tasks (learn, practise, revise, mock)
   inside availability, weighted by syllabus weight × gap, with prerequisites, revision spacing
   and a 10–15 % buffer. If the timeline cannot cover the syllabus, the planner says so and offers
   options (extend the date, add hours, prioritise high-weight topics).
   *AC:* the plan never exceeds the stated daily hours, and the student must accept it before it becomes active.
6. **Learn and practise.** Topic pages, practice sets and the AI tutor work only from approved content.
   *AC:* tutor answers to exam-specific factual questions cite an approved source or say they cannot verify.
7. **Track.** Every attempt emits learning events; mastery updates; the mistake notebook fills.
8. **Adapt.** Missed tasks lead to a supportive check-in and a re-plan proposal with its reason; the student accepts or declines.
   *AC:* no automatic silent rescheduling; a task deferred twice is flagged for review instead of being pushed again.
9. **Return.** The dashboard shows "what next and why", planned vs done, and topic trends.

## 5. Non-functional requirements

- **Mobile-first:** usable at 360 px wide. The first student page should load in under 3 s on a "Fast 3G" profile
  (target, not a gate). JS budget ≈ 200 KB gzipped for student routes.
- **Accessibility:** WCAG 2.2 AA basics, meaning keyboard navigation, labels, contrast, and Devanagari-capable fonts.
- **States:** every screen has loading, empty, error/retry and permission-denied states.
- **Privacy:** data minimisation, with no phone number, DOB, caste/category or address in the MVP.
- **Security:** server-side authorisation and RLS on every user table (see `architecture.md` §6).
- **AI cost:** hard per-user daily quota and a global monthly budget kill-switch (see §8).

## 6. AI tutor behaviour (MVP)

- Sessions are bounded: at most N turns per session and at most M sessions per day (defaults in `architecture.md`).
- The model calls server tools (`search_approved_content`, `get_question_and_answer`,
  `get_topic_learning_history`, `record_learning_event`, `create_practice_set`) and never touches the DB directly.
- Every response separates **Verified (from source)**, **Explanation** and **Suggestion**.
- If retrieval returns nothing relevant, the tutor says it cannot verify the fact and offers what it can do instead.
- The tutor refuses or redirects legal, medical and financial advice and anything unrelated to exam preparation.
- The tutor never states exam dates, vacancies, cut-offs or eligibility unless they come from an approved official-source record with a date.
- AI-generated practice questions are **never** shown to students as verified. In the MVP the tutor
  draws practice only from approved items; AI-drafted items go to the admin review queue.

## 7. Metrics instrumented in the MVP

Onboarding completion, diagnostic completion, time to first learning action, plan acceptance,
weekly active learners, weekly plan completion %, practice items attempted, mock completion,
D7/D30 return, repeat-error rate, re-assessment change per topic (descriptive only),
content error reports, AI tokens, cost per active learner, AI latency and failure rate.
Definitions live in `architecture.md` §8 (event taxonomy).

## 8. Assumptions (to validate)

| ID | Assumption | How we'll validate |
|---|---|---|
| A1 | MPSC Rajyaseva Prelims GS-I is the right first paper | Founder confirmation; beta interviews |
| A2 | Email auth is acceptable to the target users | Onboarding drop-off at the auth step in the beta |
| A3 | ~300 approved questions + ~60 topic explainers are enough for a credible beta | Content coverage per topic ≥ 5 items; beta feedback |
| A4 | Founder + 1 part-time reviewer can review content at ~50 items/week | Track review throughput |
| A5 | AI cost ≤ ₹30 per active beta learner per month at the default quotas | Cost log during the beta |
| A6 | Beta users are adults (18+) | Age confirmation at sign-up |

## 9. Founder decisions needed

See `docs/decisions/0001-mvp-scope.md` §"Open decisions". Summary:
1. Confirm the first exam/paper (proposed: MPSC Rajyaseva Prelims GS-I).
2. Approve 18+ only for the MVP.
3. Approve email-only auth (no phone OTP) for the MVP.
4. Choose the AI provider and monthly AI budget cap for the beta.
5. Content sourcing: who writes and reviews questions/explainers, and under what licence.
6. Hosting/data region: Supabase project region (proposed: Mumbai `ap-south-1`).
7. License for the new ExamSaathi code (the legacy InfiniteTalk code stays Apache-2.0).
