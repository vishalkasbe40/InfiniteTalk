-- One-off, founder-run script to grant the FIRST admin role (architecture §5).
-- Run as the database owner against the intended project, e.g.:
--   psql "$DATABASE_URL" -v admin_email='founder@example.com' -f supabase/scripts/bootstrap-admin.sql
-- The user must already have signed up. The role only takes effect in sessions with MFA (aal2),
-- so enrol TOTP before relying on it. The grant is recorded in audit_log by the user_roles trigger.
\set ON_ERROR_STOP on

begin;

-- psql variables are not substituted inside $$ blocks, so pass the email via a setting.
select set_config('bootstrap.admin_email', :'admin_email', true);

do $$
declare
  v_uid uuid;
begin
  select id into v_uid
  from auth.users
  where lower(email) = lower(current_setting('bootstrap.admin_email'));

  if v_uid is null then
    raise exception 'no auth user with that email; sign up first';
  end if;

  insert into public.user_roles (user_id, role) values (v_uid, 'admin')
  on conflict (user_id, role) do nothing;
end
$$;

commit;
