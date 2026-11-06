-- Migration: exam taxonomy + student goal and weekly availability (M1-6, M1-9)
-- Design refs: docs/data-model.md §2 and §5, ADR 0003.
--
-- Content tables (exam families ... topics, sources) are readable by signed-in users only when
-- status = 'approved'. Staff (content_reviewer/admin with MFA) can also read drafts. Nobody writes
-- through the API yet: content is entered with the service role / dashboard until the admin
-- screens (M1-7/M1-8) add audited RPCs.
-- Student tables (goals, availability) are own-read only; writes go through api_save_onboarding().
--
-- ROLLBACK (manual, local or staging only):
--   drop function if exists public.api_save_onboarding(uuid, text, date, integer[]);
--   drop function if exists private.assert_active_student();
--   drop table if exists public.study_availability, public.student_exam_goals,
--     public.topic_prerequisites, public.topics, public.subjects, public.syllabus_versions,
--     public.papers, public.exam_stages, public.exams, public.exam_families, public.sources;
--   drop type if exists public.content_status, public.source_kind;

create type public.content_status as enum ('draft', 'in_review', 'approved', 'retired');
create type public.source_kind as enum (
  'official_notification', 'official_syllabus', 'textbook_licensed', 'original', 'other'
);

-- Shared read rule for content: approved for everyone signed in; drafts for MFA staff.
create function private.can_read_content(p_status public.content_status) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_status = 'approved'::public.content_status
    or private.has_role('content_reviewer'::public.app_role)
    or private.has_role('admin'::public.app_role);
$$;

revoke all on function private.can_read_content(public.content_status) from public;
grant execute on function private.can_read_content(public.content_status) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Source register
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  status public.content_status not null default 'draft',
  kind public.source_kind not null,
  title text not null check (char_length(title) between 1 and 300),
  publisher text check (publisher is null or char_length(publisher) <= 200),
  url text check (url is null or (url ~ '^https?://' and char_length(url) <= 2000)),
  published_on date,
  retrieved_on date,
  licence_note text check (licence_note is null or char_length(licence_note) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Exam taxonomy
-- ---------------------------------------------------------------------------
create table public.exam_families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,32}$'),
  name_en text not null check (char_length(name_en) between 1 and 200),
  name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.exam_families (id),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,48}$'),
  name_en text not null check (char_length(name_en) between 1 and 200),
  name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  state text check (state is null or char_length(state) <= 64),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.exam_stages (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id),
  code text not null check (code ~ '^[A-Z0-9_]{2,32}$'),
  name_en text not null check (char_length(name_en) between 1 and 200),
  name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  sort_order smallint not null default 0,
  status public.content_status not null default 'draft',
  unique (exam_id, code)
);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.exam_stages (id),
  code text not null check (code ~ '^[A-Z0-9_]{2,32}$'),
  name_en text not null check (char_length(name_en) between 1 and 200),
  name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  -- Exam facts: may stay null until they can be cited (source_id). Never guessed.
  duration_min smallint check (duration_min is null or duration_min between 1 and 600),
  total_marks numeric(6, 2) check (total_marks is null or total_marks > 0),
  negative_marking numeric(4, 3) check (negative_marking is null or negative_marking between 0 and 1),
  source_id uuid references public.sources (id),
  status public.content_status not null default 'draft',
  unique (stage_id, code),
  check ((duration_min is null and total_marks is null and negative_marking is null) or source_id is not null)
);

create table public.syllabus_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers (id),
  label text not null check (char_length(label) between 1 and 200),
  effective_from date not null,
  source_id uuid references public.sources (id),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  syllabus_version_id uuid not null references public.syllabus_versions (id),
  name_en text not null check (char_length(name_en) between 1 and 200),
  name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  sort_order smallint not null default 0,
  status public.content_status not null default 'draft'
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id),
  parent_topic_id uuid references public.topics (id),
  name_en text not null check (char_length(name_en) between 1 and 200),
  name_mr text check (name_mr is null or char_length(name_mr) between 1 and 200),
  -- Relative syllabus weight (planner input). Must be justified by a source or reviewer note.
  weight numeric(6, 3) not null default 1 check (weight > 0 and weight <= 100),
  weight_note text check (weight_note is null or char_length(weight_note) <= 500),
  est_learn_min integer not null default 60 check (est_learn_min between 5 and 6000),
  sort_order smallint not null default 0,
  status public.content_status not null default 'draft',
  check (parent_topic_id is null or parent_topic_id <> id)
);

create table public.topic_prerequisites (
  topic_id uuid not null references public.topics (id) on delete cascade,
  requires_topic_id uuid not null references public.topics (id) on delete cascade,
  primary key (topic_id, requires_topic_id),
  check (topic_id <> requires_topic_id)
);

-- Prerequisites must not form a cycle (the planner orders topics topologically).
create function private.check_prerequisite_cycle() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    with recursive chain(id) as (
      select new.requires_topic_id
      union
      select p.requires_topic_id
      from public.topic_prerequisites p
      join chain c on p.topic_id = c.id
    )
    select 1 from chain where id = new.topic_id
  ) then
    raise exception 'topic prerequisite would create a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.check_prerequisite_cycle() from public;

create trigger topic_prerequisites_no_cycle before insert or update on public.topic_prerequisites
  for each row execute function private.check_prerequisite_cycle();

-- RLS + read-only grants for every content table.
do $$
declare
  t text;
begin
  foreach t in array array['sources', 'exam_families', 'exams', 'exam_stages', 'papers',
    'syllabus_versions', 'subjects', 'topics']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.can_read_content(status)))',
      t || '_read', t);
  end loop;
end
$$;

alter table public.topic_prerequisites enable row level security;
revoke all on public.topic_prerequisites from anon, authenticated;
grant select on public.topic_prerequisites to authenticated;
create policy topic_prerequisites_read on public.topic_prerequisites
  for select to authenticated
  using (
    exists (select 1 from public.topics t where t.id = topic_id)
    and exists (select 1 from public.topics t where t.id = requires_topic_id)
  );

-- ---------------------------------------------------------------------------
-- Guard for every student write RPC (review 0004 #3): the caller must be signed in, not
-- soft-deleted, and have granted the CURRENT version of the privacy notice, terms and 18+
-- confirmation. Mirrors the app's requireStudent(), so calling the API directly cannot skip it.
-- ---------------------------------------------------------------------------
create function private.assert_active_student() returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is not null) then
    raise exception 'account is deleted' using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(array['privacy_notice', 'terms', 'age_18_plus']::public.consent_kind[]) as k(kind)
    where not coalesce((
      select c.granted
      from public.consents c
      where c.user_id = v_uid
        and c.kind = k.kind
        and c.version = (
          select d.version from public.consent_documents d
          where d.kind = k.kind
          order by d.published_at desc
          limit 1
        )
      order by c.at desc
      limit 1
    ), false)
  ) then
    raise exception 'current consent required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke all on function private.assert_active_student() from public;

-- ---------------------------------------------------------------------------
-- Student goal and weekly availability (own-read; written only via the RPC)
-- ---------------------------------------------------------------------------
create table public.student_exam_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references public.papers (id),
  syllabus_version_id uuid not null references public.syllabus_versions (id),
  target_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index student_exam_goals_one_active on public.student_exam_goals (student_id) where active;

create table public.study_availability (
  student_id uuid not null references auth.users (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday (matches JS and Postgres dow)
  minutes smallint not null check (minutes between 0 and 720),
  is_rest_day boolean generated always as (minutes = 0) stored,
  updated_at timestamptz not null default now(),
  primary key (student_id, weekday)
);

alter table public.student_exam_goals enable row level security;
alter table public.study_availability enable row level security;
revoke all on public.student_exam_goals, public.study_availability from anon, authenticated;
grant select on public.student_exam_goals, public.study_availability to authenticated;

create policy student_exam_goals_select_own on public.student_exam_goals
  for select to authenticated using (student_id = (select auth.uid()));
create policy study_availability_select_own on public.study_availability
  for select to authenticated using (student_id = (select auth.uid()));

/**
 * Saves the onboarding answers for the CALLER (never another user):
 * goal paper, study language, target date and minutes per weekday (index 0 = Sunday).
 * Replaces the previous active goal (history is kept as inactive rows).
 * Dates are judged in India time (Asia/Kolkata), matching the app (review 0004 #6).
 */
create function public.api_save_onboarding(
  p_paper_id uuid,
  p_language text,
  p_target_date date,
  p_minutes integer[]
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.assert_active_student();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_syllabus uuid;
  v_goal uuid;
  i integer;
begin
  if p_language is null or p_language not in ('en', 'mr') then
    raise exception 'invalid language' using errcode = '22023';
  end if;
  if p_target_date is null or p_target_date <= v_today
     or p_target_date > v_today + interval '3 years' then
    raise exception 'target date must be in the future and within 3 years' using errcode = '22023';
  end if;
  if p_minutes is null or cardinality(p_minutes) <> 7 or array_ndims(p_minutes) <> 1
     or array_lower(p_minutes, 1) <> 1 then
    raise exception 'availability must have 7 days' using errcode = '22023';
  end if;
  for i in 1..7 loop
    if p_minutes[i] is null or p_minutes[i] < 0 or p_minutes[i] > 720 then
      raise exception 'daily minutes must be between 0 and 720' using errcode = '22023';
    end if;
  end loop;
  if (select sum(m) from unnest(p_minutes) as m) < 30 then
    raise exception 'at least 30 minutes per week are needed' using errcode = '22023';
  end if;

  -- The paper, every parent (stage, exam, family) and the pinned syllabus version must all be
  -- approved (review 0004 #2).
  select sv.id into v_syllabus
  from public.papers p
  join public.exam_stages s on s.id = p.stage_id
  join public.exams e on e.id = s.exam_id
  join public.exam_families f on f.id = e.family_id
  join public.syllabus_versions sv on sv.paper_id = p.id
  where p.id = p_paper_id
    and p.status = 'approved'
    and s.status = 'approved'
    and e.status = 'approved'
    and f.status = 'approved'
    and sv.status = 'approved'
    and sv.effective_from <= v_today
  order by sv.effective_from desc, sv.created_at desc
  limit 1;
  if v_syllabus is null then
    raise exception 'this exam paper is not available' using errcode = '22023';
  end if;

  -- Serialise saves by the same student (two tabs) so they queue instead of colliding.
  perform 1 from public.profiles where id = v_uid for update;

  update public.student_exam_goals set active = false where student_id = v_uid and active;
  insert into public.student_exam_goals (student_id, paper_id, syllabus_version_id, target_date)
  values (v_uid, p_paper_id, v_syllabus, p_target_date)
  returning id into v_goal;

  insert into public.study_availability (student_id, weekday, minutes, updated_at)
  select v_uid, d - 1, p_minutes[d], now() from generate_series(1, 7) as d
  on conflict (student_id, weekday) do update set minutes = excluded.minutes, updated_at = now();

  update public.profiles set preferred_language = p_language where id = v_uid;
  return v_goal;
end;
$$;

revoke all on function public.api_save_onboarding(uuid, text, date, integer[]) from public, anon;
grant execute on function public.api_save_onboarding(uuid, text, date, integer[]) to authenticated;
