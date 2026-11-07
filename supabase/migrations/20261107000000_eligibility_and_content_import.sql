-- Migration: exam eligibility rules + draft-only content import for the content agent
-- Design refs: ADR 0005 (content agent + all-exams scope), data-model §2a, CLAUDE.md §3.2/§3.4.
--
-- 1. sources.document_sha256: fingerprint of the official document, so a changed PDF shows up as
--    a new source draft (the weekly agent run compares fingerprints).
-- 2. eligibility_rules: official eligibility conditions per exam (education, age, relaxations,
--    domicile, other conditions), same draft -> in_review -> approved -> retired workflow as the
--    rest of the exam tree. Approval needs the exam chain approved and an approved OFFICIAL source.
-- 3. private.import_content_bundle(jsonb): loads a reviewed-in-Git bundle as DRAFTS only.
--    * Never approves, never edits or deletes existing rows (existing matches are reused).
--    * Only official sources may be cited; exam facts and eligibility always need a source.
--    * Every created row is audited as 'content.import' with the bundle ref (actor = none).
--    * Executable only by the database owner (the GitHub "Import content drafts" workflow via the
--      Management API). Not exposed to anon / authenticated / service_role, not in an API schema.
--
-- ROLLBACK (manual, local or staging only):
--   drop function if exists private.is_official_url(text), private.import_content_bundle(jsonb), private.import_track(text, uuid, boolean, text, jsonb),
--     private.import_source_id(jsonb, text), public.api_content_save_eligibility(uuid, uuid, text, text,
--     public.education_level, text, smallint, smallint, date, jsonb, text, text, date, date, uuid);
--   drop table if exists public.eligibility_rules; drop function if exists private.valid_relaxations(jsonb);
--   drop type if exists public.education_level; alter table public.sources drop column document_sha256;
--   then re-create private.content_parent and public.api_content_set_status from 20261106000000.

-- ---------------------------------------------------------------------------
-- 1. Source fingerprint
-- ---------------------------------------------------------------------------
alter table public.sources
  add column document_sha256 text check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$');

-- ---------------------------------------------------------------------------
-- 2. Eligibility rules
-- ---------------------------------------------------------------------------
-- Ordered: a rule's minimum is met by that level or any later one. Equivalences (e.g. diploma in
-- place of class 12) are stated in education_note and checked by the reviewer.
create type public.education_level as enum (
  'none', 'class_8', 'class_10', 'class_12', 'diploma', 'graduate', 'postgraduate', 'doctorate'
);

/** Age relaxations: {"OBC": 3, "SC": 5, ...}; category codes in capitals, 0–15 extra years. */
create function private.valid_relaxations(p jsonb) returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and (select count(*) from jsonb_object_keys(p)) <= 20
    and not exists (
      select 1 from jsonb_each(p) as e(k, v)
      where e.k !~ '^[A-Z][A-Z0-9_]{1,31}$'
        or jsonb_typeof(e.v) <> 'number'
        or (e.v)::text::numeric < 0
        or (e.v)::text::numeric > 15
    );
$$;

revoke all on function private.valid_relaxations(jsonb) from public;

create table public.eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id),
  label text not null check (char_length(label) between 1 and 200),
  post_name text check (post_name is null or char_length(post_name) <= 200),
  min_education public.education_level not null,
  education_note text check (education_note is null or char_length(education_note) <= 1000),
  age_min smallint check (age_min is null or age_min between 10 and 80),
  age_max smallint check (age_max is null or age_max between 10 and 80),
  age_reference_date date,
  age_relaxations jsonb not null default '{}'::jsonb check (private.valid_relaxations(age_relaxations)),
  domicile_state text check (domicile_state is null or char_length(domicile_state) <= 64),
  other_conditions text check (other_conditions is null or char_length(other_conditions) <= 2000),
  valid_from date,
  valid_until date,
  source_id uuid references public.sources (id),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  last_edited_by uuid references auth.users (id) on delete set null,
  unique (exam_id, label),
  check (age_min is null or age_max is null or age_min <= age_max),
  check (valid_from is null or valid_until is null or valid_from <= valid_until)
);

alter table public.eligibility_rules enable row level security;
revoke all on public.eligibility_rules from anon, authenticated, service_role;
grant select on public.eligibility_rules to authenticated;
create policy eligibility_rules_read on public.eligibility_rules
  for select to authenticated using ((select private.can_read_content(status)));

-- Parent map now includes eligibility rules (children of an exam, next to stages).
create or replace function private.content_parent(p_table text, out parent_table text, out fk_column text)
language sql
immutable
set search_path = ''
as $$
  select m.p, m.f from (values
    ('sources', null, null),
    ('exam_families', null, null),
    ('exams', 'exam_families', 'family_id'),
    ('exam_stages', 'exams', 'exam_id'),
    ('eligibility_rules', 'exams', 'exam_id'),
    ('papers', 'exam_stages', 'stage_id'),
    ('syllabus_versions', 'papers', 'paper_id'),
    ('subjects', 'syllabus_versions', 'syllabus_version_id'),
    ('topics', 'subjects', 'subject_id')
  ) as m(t, p, f)
  where m.t = p_table;
$$;

create function public.api_content_save_eligibility(
  p_id uuid, p_exam_id uuid, p_label text, p_post_name text, p_min_education public.education_level,
  p_education_note text, p_age_min smallint, p_age_max smallint, p_age_reference_date date,
  p_age_relaxations jsonb, p_domicile_state text, p_other_conditions text, p_valid_from date,
  p_valid_until date, p_source_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('exams', p_exam_id);
  if p_source_id is not null then
    perform private.assert_parent_usable('sources', p_source_id);
  end if;
  if p_min_education is null then
    raise exception 'minimum education is required' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.eligibility_rules (exam_id, label, post_name, min_education, education_note, age_min,
      age_max, age_reference_date, age_relaxations, domicile_state, other_conditions, valid_from, valid_until,
      source_id, created_by, last_edited_by)
    values (p_exam_id, private.clean(p_label), private.clean(p_post_name), p_min_education,
      private.clean(p_education_note), p_age_min, p_age_max, p_age_reference_date,
      coalesce(p_age_relaxations, '{}'::jsonb), private.clean(p_domicile_state), private.clean(p_other_conditions),
      p_valid_from, p_valid_until, p_source_id, v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('eligibility_rules', p_id);
    update public.eligibility_rules set last_edited_by = v_uid, exam_id = p_exam_id, label = private.clean(p_label),
      post_name = private.clean(p_post_name), min_education = p_min_education,
      education_note = private.clean(p_education_note), age_min = p_age_min, age_max = p_age_max,
      age_reference_date = p_age_reference_date, age_relaxations = coalesce(p_age_relaxations, '{}'::jsonb),
      domicile_state = private.clean(p_domicile_state), other_conditions = private.clean(p_other_conditions),
      valid_from = p_valid_from, valid_until = p_valid_until, source_id = p_source_id
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'eligibility_rules', v_id::text, jsonb_build_object('row', private.content_row('eligibility_rules', v_id)), v_uid);
  return v_id;
end;
$$;

revoke all on function public.api_content_save_eligibility(uuid, uuid, text, text, public.education_level, text,
  smallint, smallint, date, jsonb, text, text, date, date, uuid) from public, anon;
grant execute on function public.api_content_save_eligibility(uuid, uuid, text, text, public.education_level, text,
  smallint, smallint, date, jsonb, text, text, date, date, uuid) to authenticated;

-- Status workflow: same rules as before, plus eligibility rules; retiring checks EVERY child table.
create or replace function public.api_content_set_status(p_table text, p_id uuid, p_status public.content_status)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_parent record;
  v_from public.content_status;
  v_author uuid;
  v_parent_id uuid;
  v_parent_status public.content_status;
  v_row jsonb;
  v_kind public.source_kind;
  v_child record;
  v_count bigint;
begin
  -- Explicit allow-list: the table name is used in dynamic SQL below.
  if p_table is null or p_table not in ('sources', 'exam_families', 'exams', 'exam_stages', 'papers',
      'syllabus_versions', 'subjects', 'topics', 'eligibility_rules') then
    raise exception 'unknown content type' using errcode = '22023';
  end if;
  if p_status is null then
    raise exception 'status is required' using errcode = '22023';
  end if;
  select * into v_parent from private.content_parent(p_table);
  execute format('select status, coalesce(last_edited_by, created_by), to_jsonb(t) from public.%I t where id = $1 for update', p_table)
    into v_from, v_author, v_row using p_id;
  if v_from is null then
    raise exception 'not found' using errcode = '22023';
  end if;
  -- draft/in_review -> retired is "discard" (so an unfinished draft never blocks retiring above it).
  if not ((v_from = 'draft' and p_status in ('in_review', 'retired'))
       or (v_from = 'in_review' and p_status in ('draft', 'approved', 'retired'))
       or (v_from = 'approved' and p_status = 'retired')) then
    raise exception 'cannot change status from % to %', v_from, p_status using errcode = '22023';
  end if;
  if p_status = 'approved' then
    -- Every ancestor must be approved (and is share-locked meanwhile).
    if v_parent.parent_table is not null then
      v_parent_id := (v_row ->> v_parent.fk_column)::uuid;
      begin
        perform private.assert_chain(v_parent.parent_table, v_parent_id, true);
      exception when sqlstate '22023' then
        raise exception 'approve the parent item first (every level above must be approved)' using errcode = '22023';
      end;
    end if;
    -- Syllabus versions and eligibility rules must cite an official source (CLAUDE.md §3.2).
    if p_table = 'syllabus_versions' and v_row ->> 'source_id' is null then
      raise exception 'a syllabus version needs an official source before approval' using errcode = '22023';
    end if;
    if p_table = 'eligibility_rules' and v_row ->> 'source_id' is null then
      raise exception 'an eligibility rule needs an official source before approval' using errcode = '22023';
    end if;
    -- Cited sources must be approved and official.
    if v_row ? 'source_id' and v_row ->> 'source_id' is not null then
      select s.status, s.kind into v_parent_status, v_kind
      from public.sources s where s.id = (v_row ->> 'source_id')::uuid for share;
      if v_parent_status is distinct from 'approved' then
        raise exception 'approve the cited source first' using errcode = '22023';
      end if;
      if v_kind not in ('official_notification', 'official_syllabus') then
        raise exception 'cite an official notification or official syllabus' using errcode = '22023';
      end if;
    end if;
    -- A non-default topic weight must be justified (review 0004 #11).
    if p_table = 'topics' and (v_row ->> 'weight')::numeric <> 1 and coalesce(v_row ->> 'weight_note', '') = '' then
      raise exception 'add a weight note before approving a non-default weight' using errcode = '22023';
    end if;
    execute format('update public.%I set status = $1, approved_by = $2, approved_at = now() where id = $3', p_table)
      using p_status, v_uid, p_id;
  else
    if p_status = 'retired' then
      -- Retire bottom-up: nothing below may stay visible (review 0006 #2). Checks every child table.
      for v_child in
        select c.t, cp.fk_column
        from (values ('exams'), ('exam_stages'), ('eligibility_rules'), ('papers'), ('syllabus_versions'),
          ('subjects'), ('topics')) as c(t),
          lateral private.content_parent(c.t) cp
        where cp.parent_table = p_table
      loop
        execute format('select count(*) from public.%I where %I = $1 and status <> ''retired''', v_child.t, v_child.fk_column)
          into v_count using p_id;
        if v_count > 0 then
          raise exception 'retire the % items below this one first', v_count using errcode = '22023';
        end if;
      end loop;
      if p_table = 'sources' and (
        exists (select 1 from public.papers where source_id = p_id and status <> 'retired')
        or exists (select 1 from public.syllabus_versions where source_id = p_id and status <> 'retired')
        or exists (select 1 from public.eligibility_rules where source_id = p_id and status <> 'retired')
      ) then
        raise exception 'this source is still cited; retire the items citing it first' using errcode = '22023';
      end if;
    end if;
    execute format('update public.%I set status = $1 where id = $2', p_table) using p_status, p_id;
  end if;
  perform private.write_audit('content.status', p_table, p_id::text,
    jsonb_build_object('from', v_from, 'to', p_status,
      'self_approved', p_status = 'approved' and coalesce(v_author = v_uid, true),
      'row', v_row),
    v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Draft-only bundle import (content agent)
-- ---------------------------------------------------------------------------

/**
 * Plain https link on an official host: *.gov.in, *.nic.in or a listed exam body. No userinfo, no
 * port. Mirrors content/official-domains.json (review 0007 #3/#7); change both together.
 */
create function private.is_official_url(p_url text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_url ~ '^https://(([a-z0-9-]+\.)+(gov|nic)\.in|(www\.)?ibps\.in|sbi\.co\.in|bank\.sbi|rbi\.org\.in|opportunities\.rbi\.org\.in|(www\.)?nabard\.org|(www\.)?licindia\.in)(/[^\s]*)?$',
    false);
$$;

revoke all on function private.is_official_url(text) from public;

/** Counts created/existing rows per table; audits every created row with the bundle ref. */
create function private.import_track(p_table text, p_id uuid, p_new boolean, p_ref text, p_counts jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_bucket text := case when p_new then 'created' else 'existing' end;
begin
  if p_new then
    perform private.write_audit('content.import', p_table, p_id::text,
      jsonb_build_object('ref', p_ref, 'via', 'content_agent', 'row', private.content_row(p_table, p_id)), null);
  end if;
  return jsonb_set(p_counts, array[v_bucket, p_table],
    to_jsonb(coalesce((p_counts #>> array[v_bucket, p_table])::int, 0) + 1));
end;
$$;

revoke all on function private.import_track(text, uuid, boolean, text, jsonb) from public;

/** Resolves a bundle source key (null key -> null). Raises for unknown keys. */
create function private.import_source_id(p_sources jsonb, p_key text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  if p_key is null then
    return null;
  end if;
  if not p_sources ? p_key then
    raise exception 'unknown source key "%"', p_key using errcode = '22023';
  end if;
  return (p_sources ->> p_key)::uuid;
end;
$$;

revoke all on function private.import_source_id(jsonb, text) from public;

create function private.import_content_bundle(p_bundle jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ref text := p_bundle ->> 'ref';
  v_src jsonb := '{}'::jsonb;
  v_counts jsonb := '{"created": {}, "existing": {}}'::jsonb;
  s jsonb; f jsonb; e jsonb; st jsonb; pa jsonb; sv jsonb; su jsonb; t jsonb; el jsonb;
  v_id uuid; v_family uuid; v_exam uuid; v_stage uuid; v_paper uuid; v_sv uuid; v_subject uuid;
  v_status public.content_status;
  v_parent uuid;
  v_source uuid;
begin
  if p_bundle ->> 'format' is distinct from 'examsaathi.content-bundle/v1' then
    raise exception 'unsupported bundle format' using errcode = '22023';
  end if;
  if v_ref is null or v_ref !~ '^[a-z0-9][a-z0-9-]{2,80}$' then
    raise exception 'bundle ref must be lowercase letters, digits and dashes' using errcode = '22023';
  end if;

  -- Sources: official only, https only. Matched by link + fingerprint (a changed file = new draft).
  for s in select * from jsonb_array_elements(coalesce(p_bundle -> 'sources', '[]'::jsonb)) loop
    if s ->> 'key' is null or s ->> 'key' !~ '^[a-z0-9_-]{1,40}$' or v_src ? (s ->> 'key') then
      raise exception 'each source needs a unique key' using errcode = '22023';
    end if;
    if s ->> 'kind' is null or s ->> 'kind' not in ('official_notification', 'official_syllabus') then
      raise exception 'source "%": only official notifications or syllabus documents can be imported', s ->> 'key'
        using errcode = '22023';
    end if;
    if not private.is_official_url(s ->> 'url') then
      raise exception 'source "%": an https link on an official host is required', s ->> 'key' using errcode = '22023';
    end if;
    if coalesce(s ->> 'document_sha256', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'source "%": document_sha256 is required', s ->> 'key' using errcode = '22023';
    end if;
    select id into v_id from public.sources
    where url = s ->> 'url' and document_sha256 = s ->> 'document_sha256' and status <> 'retired'
      and kind = (s ->> 'kind')::public.source_kind
    order by id limit 1;
    if v_id is null then
      insert into public.sources (kind, title, publisher, url, published_on, retrieved_on, licence_note, document_sha256)
      values ((s ->> 'kind')::public.source_kind, private.clean(s ->> 'title'), private.clean(s ->> 'publisher'),
        s ->> 'url', (s ->> 'published_on')::date, (s ->> 'retrieved_on')::date, private.clean(s ->> 'licence_note'),
        s ->> 'document_sha256')
      returning id into v_id;
      v_counts := private.import_track('sources', v_id, true, v_ref, v_counts);
    else
      v_counts := private.import_track('sources', v_id, false, v_ref, v_counts);
    end if;
    v_src := v_src || jsonb_build_object(s ->> 'key', v_id);
  end loop;

  for f in select * from jsonb_array_elements(coalesce(p_bundle -> 'families', '[]'::jsonb)) loop
    select id, status into v_family, v_status from public.exam_families where code = upper(f ->> 'code');
    if v_status = 'retired' then
      raise exception 'exam group % is retired; use a new code', f ->> 'code' using errcode = '22023';
    end if;
    if v_family is null then
      insert into public.exam_families (code, name_en, name_mr)
      values (upper(f ->> 'code'), private.clean(f ->> 'name_en'), private.clean(f ->> 'name_mr'))
      returning id into v_family;
      v_counts := private.import_track('exam_families', v_family, true, v_ref, v_counts);
    else
      v_counts := private.import_track('exam_families', v_family, false, v_ref, v_counts);
    end if;

    for e in select * from jsonb_array_elements(coalesce(f -> 'exams', '[]'::jsonb)) loop
      v_exam := null; v_status := null;
      select id, status, family_id into v_exam, v_status, v_parent from public.exams where code = upper(e ->> 'code');
      if v_status = 'retired' then
        raise exception 'exam % is retired; use a new code', e ->> 'code' using errcode = '22023';
      end if;
      if v_exam is not null and v_parent <> v_family then
        raise exception 'exam % already belongs to another exam group', e ->> 'code' using errcode = '22023';
      end if;
      if v_exam is null then
        insert into public.exams (family_id, code, name_en, name_mr, state)
        values (v_family, upper(e ->> 'code'), private.clean(e ->> 'name_en'), private.clean(e ->> 'name_mr'),
          private.clean(e ->> 'state'))
        returning id into v_exam;
        v_counts := private.import_track('exams', v_exam, true, v_ref, v_counts);
      else
        v_counts := private.import_track('exams', v_exam, false, v_ref, v_counts);
      end if;

      for el in select * from jsonb_array_elements(coalesce(e -> 'eligibility', '[]'::jsonb)) loop
        v_source := private.import_source_id(v_src, el ->> 'source');
        if v_source is null then
          raise exception 'eligibility "%": an official source is required', el ->> 'label' using errcode = '22023';
        end if;
        v_id := null; v_status := null;
        select id, status into v_id, v_status from public.eligibility_rules
        where exam_id = v_exam and label = private.clean(el ->> 'label');
        if v_status = 'retired' then
          raise exception 'eligibility rule "%" is retired; use a new label', el ->> 'label' using errcode = '22023';
        end if;
        -- Same label but different content (e.g. a corrigendum): never ignore it silently (review 0007 #2).
        if v_id is not null and exists (
          select 1 from public.eligibility_rules r where r.id = v_id and (
            r.post_name is distinct from private.clean(el ->> 'post_name')
            or r.min_education is distinct from (el ->> 'min_education')::public.education_level
            or r.education_note is distinct from private.clean(el ->> 'education_note')
            or r.age_min is distinct from (el ->> 'age_min')::smallint
            or r.age_max is distinct from (el ->> 'age_max')::smallint
            or r.age_reference_date is distinct from (el ->> 'age_reference_date')::date
            or r.age_relaxations is distinct from coalesce(nullif(el -> 'age_relaxations', 'null'::jsonb), '{}'::jsonb)
            or r.domicile_state is distinct from private.clean(el ->> 'domicile_state')
            or r.other_conditions is distinct from private.clean(el ->> 'other_conditions')
            or r.valid_from is distinct from (el ->> 'valid_from')::date
            or r.valid_until is distinct from (el ->> 'valid_until')::date
            or r.source_id is distinct from v_source)
        ) then
          raise exception 'eligibility rule "%" already exists with different details; use a new label (e.g. with the corrigendum number)',
            el ->> 'label' using errcode = '22023';
        end if;
        if v_id is null then
          insert into public.eligibility_rules (exam_id, label, post_name, min_education, education_note, age_min,
            age_max, age_reference_date, age_relaxations, domicile_state, other_conditions, valid_from, valid_until,
            source_id)
          values (v_exam, private.clean(el ->> 'label'), private.clean(el ->> 'post_name'),
            (el ->> 'min_education')::public.education_level, private.clean(el ->> 'education_note'),
            (el ->> 'age_min')::smallint, (el ->> 'age_max')::smallint, (el ->> 'age_reference_date')::date,
            coalesce(nullif(el -> 'age_relaxations', 'null'::jsonb), '{}'::jsonb), private.clean(el ->> 'domicile_state'),
            private.clean(el ->> 'other_conditions'), (el ->> 'valid_from')::date, (el ->> 'valid_until')::date,
            v_source)
          returning id into v_id;
          v_counts := private.import_track('eligibility_rules', v_id, true, v_ref, v_counts);
        else
          v_counts := private.import_track('eligibility_rules', v_id, false, v_ref, v_counts);
        end if;
      end loop;

      for st in select * from jsonb_array_elements(coalesce(e -> 'stages', '[]'::jsonb)) loop
        v_stage := null; v_status := null;
        select id, status into v_stage, v_status from public.exam_stages
        where exam_id = v_exam and code = upper(st ->> 'code');
        if v_status = 'retired' then
          raise exception 'stage % is retired; use a new code', st ->> 'code' using errcode = '22023';
        end if;
        if v_stage is null then
          insert into public.exam_stages (exam_id, code, name_en, name_mr, sort_order)
          values (v_exam, upper(st ->> 'code'), private.clean(st ->> 'name_en'), private.clean(st ->> 'name_mr'),
            coalesce((st ->> 'sort_order')::smallint, 0))
          returning id into v_stage;
          v_counts := private.import_track('exam_stages', v_stage, true, v_ref, v_counts);
        else
          v_counts := private.import_track('exam_stages', v_stage, false, v_ref, v_counts);
        end if;

        for pa in select * from jsonb_array_elements(coalesce(st -> 'papers', '[]'::jsonb)) loop
          v_source := private.import_source_id(v_src, pa ->> 'source');
          if v_source is null and (pa ->> 'duration_min' is not null or pa ->> 'total_marks' is not null
              or pa ->> 'negative_marking' is not null) then
            raise exception 'paper %: duration, marks or negative marking need an official source', pa ->> 'code'
              using errcode = '22023';
          end if;
          v_paper := null; v_status := null;
          select id, status into v_paper, v_status from public.papers
          where stage_id = v_stage and code = upper(pa ->> 'code');
          if v_status = 'retired' then
            raise exception 'paper % is retired; use a new code', pa ->> 'code' using errcode = '22023';
          end if;
          if v_paper is not null and exists (
            select 1 from public.papers x where x.id = v_paper and (
              (pa ->> 'duration_min' is not null and x.duration_min is distinct from (pa ->> 'duration_min')::smallint)
              or (pa ->> 'total_marks' is not null and x.total_marks is distinct from (pa ->> 'total_marks')::numeric)
              or (pa ->> 'negative_marking' is not null
                  and x.negative_marking is distinct from (pa ->> 'negative_marking')::numeric))
          ) then
            raise exception 'paper % already exists with different exam facts; a reviewer must change it in Admin',
              pa ->> 'code' using errcode = '22023';
          end if;
          if v_paper is null then
            insert into public.papers (stage_id, code, name_en, name_mr, duration_min, total_marks, negative_marking, source_id)
            values (v_stage, upper(pa ->> 'code'), private.clean(pa ->> 'name_en'), private.clean(pa ->> 'name_mr'),
              (pa ->> 'duration_min')::smallint, (pa ->> 'total_marks')::numeric, (pa ->> 'negative_marking')::numeric,
              v_source)
            returning id into v_paper;
            v_counts := private.import_track('papers', v_paper, true, v_ref, v_counts);
          else
            v_counts := private.import_track('papers', v_paper, false, v_ref, v_counts);
          end if;

          for sv in select * from jsonb_array_elements(coalesce(pa -> 'syllabus_versions', '[]'::jsonb)) loop
            v_source := private.import_source_id(v_src, sv ->> 'source');
            if v_source is null then
              raise exception 'syllabus "%": an official source is required', sv ->> 'label' using errcode = '22023';
            end if;
            v_sv := null;
            select id into v_sv from public.syllabus_versions
            where paper_id = v_paper and label = private.clean(sv ->> 'label') and status <> 'retired'
            order by id limit 1;
            -- A changed document is a NEW syllabus version, never more topics under the old one.
            if v_sv is not null and exists (
              select 1 from public.syllabus_versions x where x.id = v_sv and (
                x.source_id is distinct from v_source
                or x.effective_from is distinct from (sv ->> 'effective_from')::date)
            ) then
              raise exception 'syllabus "%" already exists with a different source or date; use a new label',
                sv ->> 'label' using errcode = '22023';
            end if;
            if v_sv is null then
              insert into public.syllabus_versions (paper_id, label, effective_from, source_id)
              values (v_paper, private.clean(sv ->> 'label'), (sv ->> 'effective_from')::date, v_source)
              returning id into v_sv;
              v_counts := private.import_track('syllabus_versions', v_sv, true, v_ref, v_counts);
            else
              v_counts := private.import_track('syllabus_versions', v_sv, false, v_ref, v_counts);
            end if;

            for su in select * from jsonb_array_elements(coalesce(sv -> 'subjects', '[]'::jsonb)) loop
              v_subject := null;
              select id into v_subject from public.subjects
              where syllabus_version_id = v_sv and lower(name_en) = lower(private.clean(su ->> 'name_en'))
                and status <> 'retired'
              order by id limit 1;
              if v_subject is null then
                insert into public.subjects (syllabus_version_id, name_en, name_mr, sort_order)
                values (v_sv, private.clean(su ->> 'name_en'), private.clean(su ->> 'name_mr'),
                  coalesce((su ->> 'sort_order')::smallint, 0))
                returning id into v_subject;
                v_counts := private.import_track('subjects', v_subject, true, v_ref, v_counts);
              else
                v_counts := private.import_track('subjects', v_subject, false, v_ref, v_counts);
              end if;

              for t in select * from jsonb_array_elements(coalesce(su -> 'topics', '[]'::jsonb)) loop
                v_id := null;
                select id into v_id from public.topics
                where subject_id = v_subject and parent_topic_id is null
                  and lower(name_en) = lower(private.clean(t ->> 'name_en')) and status <> 'retired'
                order by id limit 1;
                if v_id is null then
                  insert into public.topics (subject_id, name_en, name_mr, weight, weight_note, est_learn_min, sort_order)
                  values (v_subject, private.clean(t ->> 'name_en'), private.clean(t ->> 'name_mr'),
                    coalesce((t ->> 'weight')::numeric, 1), private.clean(t ->> 'weight_note'),
                    coalesce((t ->> 'est_learn_min')::integer, 60), coalesce((t ->> 'sort_order')::smallint, 0))
                  returning id into v_id;
                  v_counts := private.import_track('topics', v_id, true, v_ref, v_counts);
                else
                  v_counts := private.import_track('topics', v_id, false, v_ref, v_counts);
                end if;
              end loop;
            end loop;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('ref', v_ref) || v_counts;
end;
$$;

-- Owner only (the import workflow connects as the database owner). Nobody using the API can call it.
revoke all on function private.import_content_bundle(jsonb) from public, anon, authenticated, service_role;
