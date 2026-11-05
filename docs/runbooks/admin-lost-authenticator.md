# Runbook: an admin lost their authenticator (phone)

Use this only when the admin has **no** working authenticator left (no backup device).
It is a privileged, manual action. Do it calmly, and record it.

**Before you start:** the Supabase dashboard account itself must have its own two-step
verification turned on (Supabase dashboard → Account → Security). Anyone who can open the SQL
Editor can do this reset, so that account is the real "master key".

1. **Confirm it is really them.** Contact the admin on a channel you already trust (phone call,
   in person). Never act on an email or chat request alone.
2. In the Supabase dashboard, open **SQL Editor → New query** and run, replacing the email:
   ```sql
   -- Removes all authenticators of this one admin and records the reset in the activity log.
   with u as (select id from auth.users where lower(email) = lower('admin@example.com'))
   , gone as (delete from auth.mfa_factors f using u where f.user_id = u.id returning f.user_id)
   select private.write_audit('mfa.reset', 'user', (select id::text from u),
                              jsonb_build_object('via', 'runbook', 'factors_removed', (select count(*) from gone)),
                              null);
   ```
3. Ask the admin to: log out, log in with **Email me a log-in link**, open **Admin area**, and set
   up a new authenticator within 15 minutes. Then add a **backup authenticator**
   (Admin → Two-step security).
4. Check **Admin → Activity log** shows `mfa.reset` and then `mfa.enrolled`.

If the lost phone may have been stolen together with the password, also reset the admin's
password (Forgot password) and consider removing the admin role until they have re-secured the
account:
```sql
delete from public.user_roles
where role = 'admin' and user_id = (select id from auth.users where lower(email) = lower('admin@example.com'));
```
(Role removals are recorded in the activity log automatically.)
