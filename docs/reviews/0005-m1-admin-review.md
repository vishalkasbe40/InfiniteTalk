# Review 0005: M1-7 admin area (two-step verification, invitations, activity log)

- Reviewer: QA/Security agent (independent; SQL repros, Next.js redirect experiments, library source)
- Date: 2026-11-05. Database authorisation confirmed correct: no path for a non-admin, an aal1
  admin or a reviewer to read invite emails, change invitations or read the activity log.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | High | Layout redirect overrode the page's (wrong `next`; E2E would fail) | Layout only hides the area from non-staff (`notFound`), never redirects; pages redirect with the right `next` |
| 2 | Medium | Own-roles query returned all users' roles at aal2 (wrong result; 1,000-row cut-off) | Filtered by the user's id |
| 3 | Medium | First authenticator could be set up from a password-only session | First set-up needs an email-link session < 15 min old; backup set-up needs a fresh code |
| 4 | Medium | No recovery path for a lost phone | Backup authenticators (Admin → Two-step security); runbook `docs/runbooks/admin-lost-authenticator.md` with audited reset; README: enable MFA on the Supabase dashboard account |
| 5 | Medium | Two-step session never expired | Admin pages need an authenticator code from the last 12 hours (JWT `amr`) |
| 6 | Low-Med | Code guessing only limited per server IP | 5 failures / 15 min per user → locked (`api_mfa_guard`), each failure audited |
| 7 | Low | Two-step events not in the activity log | `mfa.enrolled`, `mfa.verified`, `mfa.verify_failed`, `mfa.reset` (runbook) |
| 8 | Low | Comment overstated code-reuse blocking | Reworded |
| 9 | Low | Reviewers saw an "Admin area" dead end | Link shown to admins only |
| 10 | Low | Cancel invite failed silently; small tap target | Errors shown inline; 44 px target |
| 11 | Low | Text inputs unstyled; no lost-phone help | Styled; help text on the code page |
| 12 | Info | ~8 auth round trips per admin page | Per-request `cache()` for session, claims, consents, roles |

Not yet verified on the hosted project: the runbook's SQL against the real `auth.mfa_factors` table
(the local shim doesn't model it). Test it on staging before relying on it.
