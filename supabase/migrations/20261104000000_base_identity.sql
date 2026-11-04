-- Migration: base identity, roles, consent, preferences, audit log (Milestone 1, M1-3)
-- Design refs: docs/data-model.md §1 and §7, docs/architecture.md §5–6, ADR 0003.
--
-- Security pattern (ADR 0003):
--   * RLS is enabled on every table.
--   * Supabase grants new public objects to anon/authenticated by default, so every table and
--     function below REVOKEs first and then grants back only what the role needs.
--   * Students never write role, consent or audit rows directly. Consent is recorded through
--     public.api_record_consent(), which takes the user from auth.uid() only.
--   * private.* is not an API-exposed schema (keep it out of the PostgREST `db_schemas` setting).
--
-- ROLLBACK (manual, local or staging only; destroys data):
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.api_record_consent(public.consent_kind, text, boolean);
--   drop table if exists public.audit_log, public.notification_preferences, public.consents,
--     public.consent_documents, public.user_roles, public.profiles;
--   drop type if exists public.consent_kind, public.app_role;
--   drop schema if exists private cascade;

-- ---------------------------------------------------------------------------
-- Schema for internal helpers
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
-- authenticated needs USAGE so that RLS policies can call private.has_role().
grant usage on schema private to authenticated, service_role;
-- Postgres grants EXECUTE to PUBLIC on new functions; stop that for everything created here later.
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'content_reviewer', 'admin');
create type public.consent_kind as enum ('privacy_notice', 'terms', 'age_18_plus', 'email_reminders');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.reject_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on %.% is not allowed (append-only table)', tg_op, tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.reject_mutation() from public;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Must contain a visible character; no control or bidi-override characters (impersonation).
  display_name text check (
    display_name is null
    or (
      char_length(display_name) between 1 and 60
      and display_name ~ '\S'
      and display_name !~ '[\x01-\x1f\x7f\u200e\u200f\u202a-\u202e\u2066-\u2069]'
    )
  ),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'mr')),
  ui_language text not null default 'en' check (ui_language in ('en', 'mr')),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 1 and 64),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- A bad timezone would break every later query that converts times for this student.
create function private.validate_profile_timezone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_profile_timezone() from public;

create trigger profiles_validate_timezone before insert or update of timezone on public.profiles
  for each row execute function private.validate_profile_timezone();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, preferred_language, ui_language, timezone) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
-- No insert/update/delete for authenticated. Role grants happen via service-role jobs or the
-- bootstrap script (supabase/scripts/bootstrap-admin.sql); an admin RPC comes later.
-- Staff role changes are audited by trigger (below), whichever path makes them.

-- has_role: role membership; staff roles additionally require an MFA (aal2) session.
-- SECURITY DEFINER so policies can consult user_roles without recursive RLS evaluation.
create function private.has_role(p_role public.app_role) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = p_role
    )
    and (
      p_role = 'student'::public.app_role
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.deleted_at is not null
    );
$$;

revoke all on function private.has_role(public.app_role) from public;
grant execute on function private.has_role(public.app_role) to authenticated, service_role;

create policy user_roles_select_own_or_admin on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role('admin')));

-- ---------------------------------------------------------------------------
-- consent_documents: the published versions of each consent text. Rows are added by the
-- founder (service role / migration) when a new privacy notice or terms version is published.
-- ---------------------------------------------------------------------------
create table public.consent_documents (
  kind public.consent_kind not null,
  version text not null check (version ~ '^[A-Za-z0-9._-]{1,32}$'),
  published_at timestamptz not null default now(),
  primary key (kind, version)
);

alter table public.consent_documents enable row level security;
revoke all on public.consent_documents from anon, authenticated;
grant select on public.consent_documents to authenticated;

create policy consent_documents_select on public.consent_documents
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- consents (append-only evidence)
-- user_id deliberately has no FK: consent rows are retained as evidence after account
-- deletion (data-model §8a, pending counsel review R1). They hold no other personal data.
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind public.consent_kind not null,
  version text not null,
  granted boolean not null,
  at timestamptz not null default now(),
  -- Consent can only be recorded against a published document version.
  foreign key (kind, version) references public.consent_documents (kind, version)
);

create index consents_user_kind_at_idx on public.consents (user_id, kind, at desc);

create trigger consents_append_only before update or delete on public.consents
  for each row execute function private.reject_mutation();
create trigger consents_no_truncate before truncate on public.consents
  for each statement execute function private.reject_mutation();

alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
-- Even the service role may only read and append (evidence must not be rewritten).
revoke update, delete, truncate, trigger, references on public.consents from service_role;
grant select on public.consents to authenticated;

create policy consents_select_own on public.consents
  for select to authenticated using (user_id = (select auth.uid()));

create function public.api_record_consent(
  p_kind public.consent_kind,
  p_version text,
  p_granted boolean
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind is null or p_granted is null then
    raise exception 'kind and granted are required' using errcode = '22023';
  end if;
  if p_version is null or not exists (
    select 1 from public.consent_documents d where d.kind = p_kind and d.version = p_version
  ) then
    raise exception 'unknown consent version' using errcode = '22023';
  end if;

  insert into public.consents (user_id, kind, version, granted)
  values (v_uid, p_kind, p_version, p_granted);
end;
$$;

revoke all on function public.api_record_consent(public.consent_kind, text, boolean) from public, anon;
grant execute on function public.api_record_consent(public.consent_kind, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  in_app boolean not null default true,
  -- Email is only sent when this is true AND the latest email_reminders consent is granted
  -- (checked at send time, architecture §4.4 / M4-4).
  email boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  paused_until timestamptz,
  max_per_day smallint not null default 2 check (max_per_day between 0 and 10),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant update (in_app, email, quiet_start, quiet_end, paused_until, max_per_day)
  on public.notification_preferences to authenticated;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- audit_log (append-only; actor_id has no FK so entries survive account deletion)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 64),
  entity_type text not null check (char_length(entity_type) between 1 and 64),
  entity_id text check (entity_id is null or char_length(entity_id) <= 128),
  before_hash text,
  after_hash text,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index audit_log_at_idx on public.audit_log (at desc);

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.reject_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.reject_mutation();

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
revoke update, delete, truncate, trigger, references on public.audit_log from service_role;
-- The identity sequence inherits Supabase's default grants; setval() could break audit writes.
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_select_admin on public.audit_log
  for select to authenticated using ((select private.has_role('admin')));

-- Writer for definer functions, service-role jobs and the bootstrap script.
create function private.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_meta jsonb default '{}'::jsonb,
  p_actor_id uuid default null
) returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, meta)
  values (coalesce(p_actor_id, auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

revoke all on function private.write_audit(text, text, text, jsonb, uuid) from public;
grant execute on function private.write_audit(text, text, text, jsonb, uuid) to service_role;

-- Audit every staff role grant/revoke, however it happens (bootstrap, service job, RPC, cascade).
-- The automatic 'student' role on sign-up is not audited (it would only add noise).
create function private.audit_user_role_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('role.grant', 'user', new.user_id::text,
      pg_catalog.jsonb_build_object('role', new.role, 'granted_by', new.granted_by));
    return new;
  else
    perform private.write_audit('role.revoke', 'user', old.user_id::text,
      pg_catalog.jsonb_build_object('role', old.role));
    return old;
  end if;
end;
$$;

revoke all on function private.audit_user_role_change() from public;

create trigger user_roles_audit_insert after insert on public.user_roles
  for each row when (new.role <> 'student') execute function private.audit_user_role_change();
create trigger user_roles_audit_delete after delete on public.user_roles
  for each row when (old.role <> 'student') execute function private.audit_user_role_change();

-- ---------------------------------------------------------------------------
-- New-user provisioning. Never reads user metadata for roles (architecture §5).
-- ---------------------------------------------------------------------------
create function private.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
