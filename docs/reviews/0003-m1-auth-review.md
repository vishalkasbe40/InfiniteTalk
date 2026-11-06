# Review 0003: M1-4 authentication flows

- Reviewer: QA/Security agent (independent; read library source, ran repro scripts; no edit rights)
- Scope: proxy, auth server actions, email-link confirmation, Supabase clients, migrations, templates, E2E/CI
- Date: 2026-11-05. Fixes integrated by the CEO/orchestrator.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | High | Open redirect: dot-segments (`/.//evil`) normalised to `//evil` after the safety check | `safeNextPath` also checks the normalised result; unit + E2E cases |
| 2 | Blocker | E2E failed on GitHub (Next's route announcer also has `role=alert`); 8 of 11 tests never ran | Locator fixed; suite rewritten and extended to 14 journeys |
| 3 | Medium | Proxy forwarded stale cookies after a token refresh | Cookie header re-synced in `setAll` |
| 4 | Medium | GET `/auth/confirm` logged in on a plain visit: login CSRF; email scanners used up links | Link opens a "Continue" page; token verified in a POST server action |
| 5 | Medium | Log-in link for an unconfirmed account wipes its password | Log-in links are only sent to confirmed accounts (`svc_auth_email_status`) |
| 6 | Medium | Anyone knowing an invited email could give consent (and set the password) for them | **Design change:** sign-up collects only email + 18+ gate. The inbox owner sets the password and gives the recorded consents after confirming |
| 7 | Medium | Students stranded: errors reported as "sent"; invite consumed before the email went out | Invite consumed only after the email is sent; repeat sign-up re-sends; send failures shown |
| 8 | Medium | No custom SMTP: Supabase's default sender won't reach students | README checklist + beta gate (M5-11) |
| 9 | Medium | All auth calls share our server's IP for Supabase rate limits | Accepted for the invite-only beta; M1-16 before any public link (forward IP only with a secret) |
| 10 | Low | Timing reveals existing accounts (log-in link, reset) | Work runs after the response (`after()`); sign-up timing difference accepted (reveals only an invite) |
| 11 | Low | Weak tests (browser `required` hid the server check; no logout-invalidation test) | Added: server-side consent check, logout invalidation, unconfirmed-account link, repeat sign-up, password-change guard |
| 12 | Low | Default 404/error pages unstyled under the strict CSP | Custom `not-found.tsx` / `error.tsx` |
| 13 | Low | Password change with any session; consent gate only in one page | Password change only within 15 min of an email link (JWT `amr`); shared `requireUser`/`requireStudent` guards |

Known, accepted for the closed beta: send-failure message differs for invited emails (rare; reveals only an invite).
