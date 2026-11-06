-- Migration: closed-beta invite allowlist + first consent document versions (M1-4)
-- Design refs: docs/architecture.md §5 (invite-only sign-up), ADR 0003, review 0001 #9.
--
-- beta_invites is server-only: no anon/authenticated access at all. The sign-up server action
-- reads and updates it with the service role. Until the admin UI exists (M1-7/M1-8), the founder
-- adds invites in the Supabase dashboard's Table Editor (see README "Inviting beta students").
--
-- ROLLBACK (manual, local or staging only):
--   drop table if exists public.beta_invites;
--   (consent_documents rows cannot be removed once a consent references them; that is intended.)

create table public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  -- Stored lower-case so lookups are case-insensitive.
  email text not null unique
    check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%'),
  note text check (note is null or char_length(note) <= 200),
  invited_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

alter table public.beta_invites enable row level security;
revoke all on public.beta_invites from anon, authenticated;
-- No policies: only the service role (which bypasses RLS) and the owner can touch invites.

-- Lower-case emails typed into the dashboard, so the founder doesn't have to.
create function private.normalise_invite_email() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

revoke all on function private.normalise_invite_email() from public;

create trigger beta_invites_normalise_email before insert or update of email on public.beta_invites
  for each row execute function private.normalise_invite_email();

-- First published versions of the consent documents. The texts are DRAFTS pending legal
-- review (R1); a reviewed text gets a new version, and students are asked to re-consent.
insert into public.consent_documents (kind, version, published_at) values
  ('privacy_notice', '2026-11-draft1', '2026-11-05T00:00:00Z'),
  ('terms', '2026-11-draft1', '2026-11-05T00:00:00Z'),
  ('age_18_plus', '2026-11-v1', '2026-11-05T00:00:00Z');
