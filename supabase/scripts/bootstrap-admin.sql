-- One-off, founder-run script to grant the FIRST admin role (architecture §5).
-- Run as the database owner against the intended project, e.g.:
--   psql "$DATABASE_URL" -v admin_email='founder@example.com' -f supabase/scripts/bootstrap-admin.sql
-- The user must already have signed up. The role only takes effect in sessions with MFA (aal2),
-- so enrol TOTP before relying on it. Every run is recorded in audit_log.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_email text := :'admin_email';
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'no auth user with that email; sign up first';
  end if;

  insert into public.user_roles (user_id, role) values (v_uid, 'admin')
  on conflict (user_id, role) do nothing;

  perform private.write_audit('role.grant', 'user', v_uid::text,
    jsonb_build_object('role', 'admin', 'via', 'bootstrap-admin.sql'), null);
end
$$;

commit;
