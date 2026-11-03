# ADR 0001 — MVP scope and first learning loop

- Status: **Proposed** (needs founder acceptance of the open decisions below)
- Date: 2026-11-03
- Deciders: Founder; CEO/orchestrator agent (proposer)

## Context
`CLAUDE.md` describes five product pillars and four phases. A solo founder can't build or
operate all of them safely at once. The North-star is to help one real aspirant make measurable
progress toward one real exam.

## Decision (proposed)
1. **One exam, one paper:** MPSC State Services (Rajyaseva) Prelims, GS Paper I. The data model stays multi-exam.
2. **One loop first:** onboarding → diagnostic → baseline → deterministic plan → learn/practise/tutor →
   events/mastery → progress and re-plan proposals. That is Milestones 1–4, then M5 beta readiness.
3. **Closed, free beta** for 20–50 adult (18+) users. No payments, subscriptions or teacher marketplace.
4. **Email-based auth only** (password + magic link) for the MVP.
5. **Channels:** in-app plus opt-in email reminders only. No WhatsApp, SMS or voice.
6. **AI:** a bounded tutor grounded in human-approved content. AI may draft content into a review queue
   but can never publish it. A deterministic planner owns dates and workload.
7. **Stack:** Next.js + TypeScript (strict) modular monolith, Supabase (Postgres, Auth, RLS, pgvector),
   managed hosting, pnpm workspaces. See `architecture.md`.
8. **Content target for the beta:** about 300 approved MCQs and about 60 topic explainers covering GS-I, with
   ≥ 5 approved items per topic before that topic appears in the diagnostic.

## Consequences
- Fast path to a testable loop. Teacher and community pillars are deferred until the beta shows plan usage and return rates.
- Content review throughput, not engineering, is likely the bottleneck (assumption A4 in the PRD).
- Email-only auth may reduce sign-up for some users. We measure drop-off before adding phone OTP (SMS cost plus DLT registration).
- 18+ only avoids guardian-consent flows for now, but excludes some aspirants. Revisit with counsel.

## Alternatives considered
- **Build all pillars at a shallow depth:** rejected because it breaks principle 1 and the release gates.
- **Start with SSC/Banking (larger national market):** rejected for now because the founder hypothesis is MPSC/Marathi and regional language is a differentiator.
- **LLM-generated plans:** rejected because it breaks the deterministic-planning rule (`CLAUDE.md` §5).
- **Separate FastAPI backend:** deferred because one deployable is simpler for a solo operator.

## Open decisions (founder)
| # | Decision | Proposed default |
|---|---|---|
| D1 | First exam/paper | MPSC Rajyaseva Prelims GS-I |
| D2 | Age policy for the MVP | 18+ only |
| D3 | Auth methods | Email password + magic link |
| D4 | AI provider and model tiers | Choose one provider; keep the adapter swappable |
| D5 | Monthly AI budget cap for the beta | ₹5,000/month hard cap (placeholder) |
| D6 | Content authorship and licensing | Original content written or reviewed by named reviewers; no copying from copyrighted books |
| D7 | Data region / hosting | Supabase `ap-south-1` (Mumbai); hosting region close to Mumbai |
| D8 | Tutor transcript retention | 30 days, then reduced to structured learning facts |
| D9 | Licence for ExamSaathi code | Proprietary (all rights reserved) until decided |
| D10 | Paid Supabase tier for PITR backups before the beta | Yes, before real users |
