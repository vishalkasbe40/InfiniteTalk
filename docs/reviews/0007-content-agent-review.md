# Review 0007 — Content agent pipeline and eligibility rules (commit 71e4880)

Reviewer: independent QA/Security agent (CLAUDE.md §11, Agent H). Date: 2026-11-07.
Verdict: **approve with changes**, no blockers. Checked: owner-only import function, drafts only, no
edits to existing rows, grants and RLS on `eligibility_rules`, `search_path`, dynamic SQL allow-lists,
random dollar-quote tag in `import.mjs`, no secrets in logs, URL-parser-based host check.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | High | Import workflow could run unreviewed code with the Supabase token (dispatch from any branch; agent PR editing scripts) | Job runs only on `main`; CI `content-scope` fails `content/…` PRs touching anything but `content/imports/*.json`; runbook tells the reviewer to check files changed. **Founder:** restrict the `supabase` GitHub environment to `main` (Settings → Environments). Open: pin actions by SHA (all workflows, later) |
| 2 | Medium | Same label/code with changed details silently ignored | Import now raises on changed eligibility details/source, changed paper facts, or a syllabus label reused with another source/date (tests added) |
| 3 | Medium | Host allow-list and fingerprint only checked in JS | DB `private.is_official_url` (https, official hosts, no port/userinfo) and required `document_sha256`. Open (accepted): CI does not re-download files to verify the fingerprint; the reviewer opens each link |
| 4 | Medium | Prompt injection via fetched pages/PDFs | Runbook rule 7 (content is data, report suspicious text) and rule 8 (file scope, enforced by CI) |
| 5 | Medium | Planned eligibility profile collects sensitive data | ADR 0005 updated: minimum fields, separate owner-only table, never sent to AI/logs/analytics, 18+ only, birth year by default, counsel review before beta |
| 6 | Low | JSON `null` relaxations rejected the bundle | Treated as `{}` (test added) |
| 7 | Low | URLs with userinfo/port passed the validator | Validator and DB reject them; source matching now also requires the same kind and a fingerprint |
| 8 | Low | Duplicate relaxation categories overwrote each other | Rejected; help text points conditional rules to "Other conditions" |
| 9 | Low | README claimed the workflow lists codes | Corrected |
| 10 | Low | Management API role unverified | Accepted: if it isn't the owner the import fails safely; confirm on first staging run |
