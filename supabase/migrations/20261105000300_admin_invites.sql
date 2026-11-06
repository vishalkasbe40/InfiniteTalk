-- Migration: admin management of beta invitations (M1-7 / M1-8 part 1)
-- Design refs: docs/architecture.md §5 (admin MFA), ADR 0003 (+ amendment), CLAUDE.md §9 (audit).
--
-- Admins (role 'admin' with an MFA/aal2 session, enforced by private.has_role) can list, add and
-- revoke invitations. Writes go through audited RPCs only; audit entries hold the invite id, not
-- the email address (data minimisation; the email stays in beta_invites).
--
-- ROLLBACK (manual, local or staging only):
--   drop function if exists public.api_admin_add_invite(text, text);
--   drop function if exists public.api_admin_revoke_invite(uuid);
--   drop function if exists private.assert_admin();
--   drop policy if exists beta_invites_select_admin on public.beta_invites;
--   revoke select on public.beta_invites from authenticated;

create function private.assert_admin() returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- has_role: role row + aal2 session + not soft-deleted.
  if not private.has_role('admin'::public.app_role) then
    raise exception 'admin with two-step verification required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function private.assert_admin() from public;

grant select on public.beta_invites to authenticated;
create policy beta_invites_select_admin on public.beta_invites
  for select to authenticated using ((select private.has_role('admin')));

create function public.api_admin_add_invite(p_email text, p_note text default null) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.assert_admin();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  insert into public.beta_invites (email, note) values (v_email, v_note)
  on conflict (email) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'already invited' using errcode = '23505';
  end if;
  perform private.write_audit('invite.add', 'beta_invite', v_id::text, '{}'::jsonb, v_admin);
  return v_id;
end;
$$;

create function public.api_admin_revoke_invite(p_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.assert_admin();
begin
  delete from public.beta_invites where id = p_id and used_at is null;
  if not found then
    raise exception 'invite not found or already used' using errcode = '22023';
  end if;
  perform private.write_audit('invite.revoke', 'beta_invite', p_id::text, '{}'::jsonb, v_admin);
end;
$$;

revoke all on function public.api_admin_add_invite(text, text) from public, anon;
revoke all on function public.api_admin_revoke_invite(uuid) from public, anon;
grant execute on function public.api_admin_add_invite(text, text) to authenticated;
grant execute on function public.api_admin_revoke_invite(uuid) to authenticated;
