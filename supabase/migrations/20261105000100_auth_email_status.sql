-- Migration: server-only helper to check an email's account status (M1-4, review 0003 #5/#7).
-- Lets the sign-up/log-in server actions avoid actions that would harm unconfirmed accounts
-- (e.g. a log-in link wiping the password of an invited, not-yet-confirmed student) without
-- listing all users. Callable ONLY by the service role; never by students or anonymous callers.
--
-- ROLLBACK: drop function if exists public.svc_auth_email_status(text);

create function public.svc_auth_email_status(p_email text) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.id is null then 'none'
    when u.email_confirmed_at is null then 'unconfirmed'
    else 'confirmed'
  end
  from (select 1) as one
  left join auth.users u on lower(u.email) = lower(trim(p_email));
$$;

revoke all on function public.svc_auth_email_status(text) from public, anon, authenticated;
grant execute on function public.svc_auth_email_status(text) to service_role;
