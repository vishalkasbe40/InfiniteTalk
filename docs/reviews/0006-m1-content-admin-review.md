# Review 0006: M1-8 part 2, content management

- Reviewer: QA/Security agent (independent; SQL attack scripts incl. two-session races; no edit rights)
- Date: 2026-11-06. Injection and privilege protections held (table allow-list, `%I` + `USING`,
  private helpers not callable, no direct writes, aal2 enforced, no XSS sinks). Fixes integrated by
  the CEO/orchestrator; the migration was edited in place (not yet applied to any hosted environment).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | High | Check/write race let an approved row be edited (approval rules bypassed) | Rows locked `FOR UPDATE` while checked and changed; ancestors `FOR SHARE` |
| 2 | High | Retire didn't cascade; approval checked only the direct parent (student-visible orphans) | Whole-chain checks for create/edit/approve; retire blocked while non-retired items sit below (retire bottom-up); drafts can be discarded; cited sources can't be retired |
| 3 | Medium | Syllabus/paper approvable with no or unofficial source | Syllabus approval needs an approved **official** source; cited sources must be official |
| 4 | Medium | Audit couldn't show what was approved; self-approval missed the last editor | Row snapshot in every create/update/approve audit entry; `last_edited_by`; self-approval flagged for author or last editor |
| 5 | Medium | Self-approval never blocked | **Founder decision pending** (flag-only during the single-founder beta vs. block once a second reviewer exists) |
| 6 | Medium | Paper visible in onboarding before its syllabus is approved | Loader requires an approved, in-effect syllabus version (same rule as the save RPC) |
| 7 | Low | Null status slipped past the transition guard | Explicit check |
| 8 | Low | Approved items hid their citation; retired cited source silently dropped on save | Citation + approval time shown; cited source kept in options with its status |
| 9 | Low | Non-UUID `?parent=` gave a 500 | Validated → 404 |
| 10 | Low | E2E save/approve race; DB test gaps | Reload-until-saved; 4 new DB tests (whole chain, official source, snapshot/self-approval, null/aal1/student) |
| 11 | Info | Reviewer home ran invite queries; success not announced | Skipped for reviewers; status messages announced |
