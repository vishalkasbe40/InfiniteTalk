# Review 0004: M1-6/9/10/11 exam taxonomy, onboarding, dashboard

- Reviewer: QA/Security agent (independent; SQL attack scripts on a scratch DB; no edit rights)
- Date: 2026-11-05. No cross-student read/write path found. Fixes integrated by the CEO/orchestrator;
  the migration was edited in place (not yet applied to any hosted environment).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | High | Onboarding form cleared every answer after an error (React form reset) | Submitted values returned and re-filled; E2E asserts values survive an error |
| 2 | Medium | A paper under a draft/retired exam, stage or family could be offered and pinned | RPC and loader require every parent approved; DB tests per level |
| 3 | Medium | RPC didn't check consent or soft-deletion (API callers could skip the app's gate) | `private.assert_active_student()` called first; **rule for every future `api_*` write** (ADR 0003); DB tests |
| 4 | Medium | Approved rows under a retired parent remain visible | Deferred to M2: all student content queries must start from the pinned `student_exam_goals.syllabus_version_id` (backlog M2-0) |
| 5 | Low-Med | Negative "days from today" after the target date | Supportive "set a new target date" state |
| 6 | Low | App used India date, DB used UTC date | RPC uses `Asia/Kolkata` date; one `maxTargetDate` helper for HTML + validation |
| 7 | Low | Saving from two tabs gave a vague error | Row lock serialises saves; 23505 mapped to a clear message |
| 8 | Low | Thin goal/availability history for plan versioning | Deferred: snapshot goal + availability into each plan version (backlog M2-9) |
| 9 | Low | Day selects named twice by screen readers; "why" lines not linked | `htmlFor` labels; `aria-describedby` on each question |
| 10 | Low | Eligibility notice had no link and always said MPSC | Wording made exam-neutral; linking an approved official source is backlog M1-17 |
| 11 | Low | Topic weight justification not enforced; cycle-check race | Backlog M1-8 (admin content RPCs: enforce `weight_note`, lock during prerequisite edits) |
| 12 | Low | Test gaps | Added: parent statuses, future syllabus, newest version, odd arrays, consent/deleted callers, prerequisite visibility |
