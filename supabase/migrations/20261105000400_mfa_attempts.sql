-- Migration: two-step verification attempt limit + audit (review 0005 #6/#7)
-- Supabase's own limits are per IP, and every verification comes from our server's IP, so we
-- also count failed codes per user: 5 failures in 15 minutes locks that user's verification for
-- 15 minutes. Two-step events are written to the audit log.
--
-- ROLLBACK (manual, local or staging only):
--   drop function if exists public.api_mfa_guard();
--   drop function if exists public.api_mfa_record(text);
--   drop table if exists private.mfa_failures;

create table private.mfa_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

create index mfa_failures_user_at_idx on private.mfa_failures (user_id, at desc);
revoke all on private.mfa_failures from public, anon, authenticated;

-- Staff (any role row; aal2 not yet required: this runs before the code is verified).
create function private.assert_staff_member() returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid and r.role in ('admin', 'content_reviewer')
  ) then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke all on function private.assert_staff_member() from public;

/** Raises 'too many attempts' (P0001 with hint) if the caller is locked; otherwise returns attempts left. */
create function public.api_mfa_guard() returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_staff_member();
  v_recent integer;
begin
  select count(*) into v_recent
  from private.mfa_failures
  where user_id = v_uid and at > now() - interval '15 minutes';
  if v_recent >= 5 then
    raise exception 'too many attempts' using errcode = '54000';
  end if;
  return 5 - v_recent;
end;
$$;

create function public.api_mfa_record(p_event text) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_staff_member();
begin
  if p_event = 'verify_failed' then
    insert into private.mfa_failures (user_id) values (v_uid);
    -- Keep the table small: forget failures older than a day.
    delete from private.mfa_failures where user_id = v_uid and at < now() - interval '1 day';
  elsif p_event not in ('enrolled', 'verified') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  perform private.write_audit('mfa.' || p_event, 'user', v_uid::text, '{}'::jsonb, v_uid);
end;
$$;

revoke all on function public.api_mfa_guard() from public, anon;
revoke all on function public.api_mfa_record(text) from public, anon;
grant execute on function public.api_mfa_guard() to authenticated;
grant execute on function public.api_mfa_record(text) to authenticated;
