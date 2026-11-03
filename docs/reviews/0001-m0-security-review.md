# Review 0001 — Milestone 0 QA/Security review of the planning docs

- Reviewer: QA/Security agent (independent; a separate agent from the author, with no edit rights)
- Scope: `CLAUDE.md`, `product-requirements.md`, `architecture.md`, `data-model.md` (draft v0.1)
- Date: 2026-11-03. The fixes were integrated by the CEO/orchestrator. **These are design changes in docs only. Nothing is implemented or tested yet.**

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | Blocker | Answer explanations reachable through tutor retrieval | Student retrieval excludes `question_answer` chunks (arch §4.7, DM §3); test required |
| 2 | Blocker | Tutor/practice usable mid-mock to reveal answers | Timed-attempt lock on tutor + practice; `pool = assessment` items held out (arch §4.5) |
| 3 | High | Contradictory answer-key read rules; options could carry keys | No student select on keys or bank; `reveal_answer` with ownership checks; options check constraint (arch §6) |
| 4 | High | Answer keys not versioned; dispute behaviour undefined | Keys keyed by `(question_id, version)`; versions immutable; dispute = unserved/unscored + audited rescoring (DM §3) |
| 5 | High | Privileged writes undefined; RPCs callable with forged args | ADR 0003 |
| 6 | High | RLS can't restrict columns | Column grants / RPC-only writes (DM legend, ADR 0003) |
| 7 | High | Model-authored learning events could change mastery | Only server-graded events are evidentiary; tutor emits non-evidentiary kinds; quiz graded server-side (arch §4.5, DM §5) |
| 8 | High | Magic link creates users without consent | Sign-up via server action; `shouldCreateUser: false`; consent middleware (arch §5) |
| 9 | High | Supabase Auth bypasses app rate limits | Invite allowlist, CAPTCHA, Auth rate limits, generic responses, custom SMTP (arch §5) |
| 10 | High | Admin MFA not enforced | `has_role` requires `aal2` for admin/reviewer; bootstrap documented (arch §5) |
| 11 | High | Tutor cost bounds incomplete; budget overshoot | Input/tool/token caps, one in-flight turn, reserve-then-settle, 95 % stop (arch §4.5–4.6) |
| 12 | Medium | Forged citations; unverified label applied after streaming | Server-held citations only; buffered labelling (arch §4.5) |
| 13 | Medium | Markdown/LLM XSS and image exfiltration | Sanitised markdown, no LLM images, CSP `img-src` (arch §4.5, §6) |
| 14 | Medium | Question bank downloadable | No student select on `questions`; RPC serves own attempt items only (DM §3) |
| 15 | Medium | No server timer; `is_correct` timing inconsistent | Server deadline + auto-submit; grading timing unified; clamped `response_ms` (arch §4.1, DM §4) |
| 16 | Medium | Deletion/export inventory incomplete; analytics id linkable | DM §8a inventory; HMAC `user_ref`; correction path |
| 17 | Medium | Transcript retention contradictory; others missing | Transcripts deleted at 30 days; retention per table in DM §8a; backup window in the privacy notice |
| 18 | Medium | Release-gate gaps (incident runbook, PITR, unsubscribe, pgTAP coverage) | Added to the backlog as M5 hard gates; pgTAP covers all tables + functions (DM §8 rules 7, 9, 10) |
| 19 | Low | `approved-read` lacked a status column on some tables; goal could pin a draft syllabus | `status` columns added; goal set via an RPC that validates the version |
| 20 | Low | Auth/cron hardening (PKCE, redirects, constant-time secret, server-only, PII notice) | Added (arch §5, §6, §4.5) |

## Decisions raised for founder/counsel
These are recorded in ADR 0001 as R1–R8: age-gate adequacy under the DPDP Act 2023, the AI provider's data terms
and cross-border transfer, retention periods, held-out assessment pool size, invite-only beta,
the disputed-key rescoring policy, the breach-response owner, and the budget/quota model.
