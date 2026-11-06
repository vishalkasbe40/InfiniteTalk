-- Migration: content management RPCs for exam taxonomy + sources (M1-8 part 2)
-- Design refs: data-model §2/§8 rule 8, CLAUDE.md §3.2/§3.4 (traceable, human-reviewed content),
-- ADR 0003, review 0004 #11.
--
-- Workflow: draft -> in_review -> approved -> retired (and in_review -> draft to send back;
--   draft / in_review -> retired to discard).
--   * Only staff (content_reviewer or admin) with a two-step (aal2) session can write.
--   * Only draft / in_review rows can be edited; approved rows are fixed (retire + recreate).
--   * Approving needs EVERY ancestor approved (not just the parent); a syllabus version needs an
--     approved OFFICIAL source; cited sources must be approved and official for paper facts; a
--     topic weight other than 1 needs a note (review 0006 #2/#3).
--   * Retiring is blocked while non-retired items sit below (retire bottom-up), and a source can't
--     be retired while non-retired items cite it, so retiring never leaves student-visible orphans.
--   * Rows are locked while they are checked and changed (no check/write races, review 0006 #1).
--   * Audit entries carry a snapshot of the row (what was approved / saved, review 0006 #4).
--   * Approval by the item's author or last editor is allowed (single-founder beta) but flagged in
--     the audit log as self_approved (data-model §8 rule 8; decision pending, see review 0006 #5).
--   * Every create / update / status change is audited.
--
-- ROLLBACK (manual, local or staging only): drop the api_content_* functions,
--   private.assert_content_staff, private.content_parent, and the created_by / approved_by /
--   approved_at columns.

-- ---------------------------------------------------------------------------
-- Authorship columns
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sources', 'exam_families', 'exams', 'exam_stages', 'papers',
    'syllabus_versions', 'subjects', 'topics']
  loop
    execute format('alter table public.%I add column created_by uuid references auth.users (id) on delete set null', t);
    execute format('alter table public.%I add column approved_by uuid references auth.users (id) on delete set null', t);
    execute format('alter table public.%I add column approved_at timestamptz', t);
    execute format('alter table public.%I add column last_edited_by uuid references auth.users (id) on delete set null', t);
  end loop;
end
$$;

create function private.assert_content_staff() returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_role('content_reviewer'::public.app_role) or private.has_role('admin'::public.app_role)) then
    raise exception 'content staff with two-step verification required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function private.assert_content_staff() from public;

/** Parent table and FK column of each content table (null for top-level). */
create function private.content_parent(p_table text, out parent_table text, out fk_column text)
language sql
immutable
set search_path = ''
as $$
  select m.p, m.f from (values
    ('sources', null, null),
    ('exam_families', null, null),
    ('exams', 'exam_families', 'family_id'),
    ('exam_stages', 'exams', 'exam_id'),
    ('papers', 'exam_stages', 'stage_id'),
    ('syllabus_versions', 'papers', 'paper_id'),
    ('subjects', 'syllabus_versions', 'syllabus_version_id'),
    ('topics', 'subjects', 'subject_id')
  ) as m(t, p, f)
  where m.t = p_table;
$$;

revoke all on function private.content_parent(text) from public;

/**
 * Walks up from (p_table, p_id) through every ancestor. With p_require_approved, every row on the
 * way must be approved; otherwise none may be retired. Rows are share-locked so they can't be
 * retired or re-parented while the caller relies on them (review 0006 #1/#2).
 */
create function private.assert_chain(p_table text, p_id uuid, p_require_approved boolean) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_table text := p_table;
  v_id uuid := p_id;
  v_status public.content_status;
  v_row jsonb;
  v_parent record;
begin
  if p_id is null then
    raise exception 'parent is required' using errcode = '22023';
  end if;
  while v_table is not null loop
    execute format('select status, to_jsonb(t) from public.%I t where id = $1 for share', v_table)
      into v_status, v_row using v_id;
    if v_status is null then
      raise exception 'parent not found' using errcode = '22023';
    end if;
    if p_require_approved and v_status <> 'approved' then
      raise exception 'approve every item above this one first' using errcode = '22023';
    end if;
    if v_status = 'retired' then
      raise exception 'cannot use retired content' using errcode = '22023';
    end if;
    select * into v_parent from private.content_parent(v_table);
    exit when v_parent.parent_table is null;
    v_id := (v_row ->> v_parent.fk_column)::uuid;
    v_table := v_parent.parent_table;
  end loop;
end;
$$;

revoke all on function private.assert_chain(text, uuid, boolean) from public;

/** Raises unless the referenced parent (and everything above it) exists and is not retired. */
create function private.assert_parent_usable(p_parent_table text, p_parent_id uuid) returns void
language sql
volatile
security definer
set search_path = ''
as $$ select private.assert_chain(p_parent_table, p_parent_id, false) $$;

revoke all on function private.assert_parent_usable(text, uuid) from public;

/** Current row as JSON, for audit snapshots. */
create function private.content_row(p_table text, p_id uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table) into v using p_id;
  return v;
end;
$$;

revoke all on function private.content_row(text, uuid) from public;

/** Raises unless the row exists and is still editable (draft / in_review). */
create function private.assert_editable(p_table text, p_id uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.content_status;
begin
  -- FOR UPDATE: the row stays locked until the caller's update, so it can't be approved in between.
  execute format('select status from public.%I where id = $1 for update', p_table) into v_status using p_id;
  if v_status is null then
    raise exception 'not found' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'in_review') then
    raise exception 'approved or retired content cannot be edited' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.assert_editable(text, uuid) from public;

-- Trims text; empty -> null.
create function private.clean(p text) returns text
language sql
immutable
set search_path = ''
as $$ select nullif(btrim(p), '') $$;

revoke all on function private.clean(text) from public;

-- ---------------------------------------------------------------------------
-- Save functions (create when p_id is null, otherwise update an editable row)
-- ---------------------------------------------------------------------------
create function public.api_content_save_source(
  p_id uuid, p_kind public.source_kind, p_title text, p_publisher text, p_url text,
  p_published_on date, p_retrieved_on date, p_licence_note text
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  if p_id is null then
    insert into public.sources (kind, title, publisher, url, published_on, retrieved_on, licence_note, created_by, last_edited_by)
    values (p_kind, private.clean(p_title), private.clean(p_publisher), private.clean(p_url),
            p_published_on, p_retrieved_on, private.clean(p_licence_note), v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('sources', p_id);
    update public.sources set last_edited_by = v_uid, kind = p_kind, title = private.clean(p_title),
      publisher = private.clean(p_publisher), url = private.clean(p_url), published_on = p_published_on,
      retrieved_on = p_retrieved_on, licence_note = private.clean(p_licence_note)
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'sources', v_id::text, jsonb_build_object('row', private.content_row('sources', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_family(p_id uuid, p_code text, p_name_en text, p_name_mr text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  if p_id is null then
    insert into public.exam_families (code, name_en, name_mr, created_by, last_edited_by)
    values (upper(private.clean(p_code)), private.clean(p_name_en), private.clean(p_name_mr), v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('exam_families', p_id);
    update public.exam_families set last_edited_by = v_uid, code = upper(private.clean(p_code)), name_en = private.clean(p_name_en),
      name_mr = private.clean(p_name_mr) where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'exam_families', v_id::text, jsonb_build_object('row', private.content_row('exam_families', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_exam(
  p_id uuid, p_family_id uuid, p_code text, p_name_en text, p_name_mr text, p_state text
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('exam_families', p_family_id);
  if p_id is null then
    insert into public.exams (family_id, code, name_en, name_mr, state, created_by, last_edited_by)
    values (p_family_id, upper(private.clean(p_code)), private.clean(p_name_en), private.clean(p_name_mr),
            private.clean(p_state), v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('exams', p_id);
    update public.exams set last_edited_by = v_uid, family_id = p_family_id, code = upper(private.clean(p_code)),
      name_en = private.clean(p_name_en), name_mr = private.clean(p_name_mr), state = private.clean(p_state)
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'exams', v_id::text, jsonb_build_object('row', private.content_row('exams', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_stage(
  p_id uuid, p_exam_id uuid, p_code text, p_name_en text, p_name_mr text, p_sort_order smallint
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('exams', p_exam_id);
  if p_id is null then
    insert into public.exam_stages (exam_id, code, name_en, name_mr, sort_order, created_by, last_edited_by)
    values (p_exam_id, upper(private.clean(p_code)), private.clean(p_name_en), private.clean(p_name_mr),
            coalesce(p_sort_order, 0), v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('exam_stages', p_id);
    update public.exam_stages set last_edited_by = v_uid, exam_id = p_exam_id, code = upper(private.clean(p_code)),
      name_en = private.clean(p_name_en), name_mr = private.clean(p_name_mr), sort_order = coalesce(p_sort_order, 0)
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'exam_stages', v_id::text, jsonb_build_object('row', private.content_row('exam_stages', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_paper(
  p_id uuid, p_stage_id uuid, p_code text, p_name_en text, p_name_mr text,
  p_duration_min smallint, p_total_marks numeric, p_negative_marking numeric, p_source_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('exam_stages', p_stage_id);
  if p_source_id is not null then
    perform private.assert_parent_usable('sources', p_source_id);
  end if;
  if p_id is null then
    insert into public.papers (stage_id, code, name_en, name_mr, duration_min, total_marks,
      negative_marking, source_id, created_by, last_edited_by)
    values (p_stage_id, upper(private.clean(p_code)), private.clean(p_name_en), private.clean(p_name_mr),
            p_duration_min, p_total_marks, p_negative_marking, p_source_id, v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('papers', p_id);
    update public.papers set last_edited_by = v_uid, stage_id = p_stage_id, code = upper(private.clean(p_code)),
      name_en = private.clean(p_name_en), name_mr = private.clean(p_name_mr), duration_min = p_duration_min,
      total_marks = p_total_marks, negative_marking = p_negative_marking, source_id = p_source_id
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'papers', v_id::text, jsonb_build_object('row', private.content_row('papers', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_syllabus(
  p_id uuid, p_paper_id uuid, p_label text, p_effective_from date, p_source_id uuid
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('papers', p_paper_id);
  if p_source_id is not null then
    perform private.assert_parent_usable('sources', p_source_id);
  end if;
  if p_effective_from is null then
    raise exception 'effective date is required' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.syllabus_versions (paper_id, label, effective_from, source_id, created_by, last_edited_by)
    values (p_paper_id, private.clean(p_label), p_effective_from, p_source_id, v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('syllabus_versions', p_id);
    update public.syllabus_versions set last_edited_by = v_uid, paper_id = p_paper_id, label = private.clean(p_label),
      effective_from = p_effective_from, source_id = p_source_id
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'syllabus_versions', v_id::text, jsonb_build_object('row', private.content_row('syllabus_versions', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_subject(
  p_id uuid, p_syllabus_version_id uuid, p_name_en text, p_name_mr text, p_sort_order smallint
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('syllabus_versions', p_syllabus_version_id);
  if p_id is null then
    insert into public.subjects (syllabus_version_id, name_en, name_mr, sort_order, created_by, last_edited_by)
    values (p_syllabus_version_id, private.clean(p_name_en), private.clean(p_name_mr), coalesce(p_sort_order, 0), v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('subjects', p_id);
    update public.subjects set last_edited_by = v_uid, syllabus_version_id = p_syllabus_version_id, name_en = private.clean(p_name_en),
      name_mr = private.clean(p_name_mr), sort_order = coalesce(p_sort_order, 0)
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'subjects', v_id::text, jsonb_build_object('row', private.content_row('subjects', v_id)), v_uid);
  return v_id;
end;
$$;

create function public.api_content_save_topic(
  p_id uuid, p_subject_id uuid, p_name_en text, p_name_mr text, p_weight numeric,
  p_weight_note text, p_est_learn_min integer, p_sort_order smallint
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := private.assert_content_staff();
  v_id uuid := p_id;
begin
  perform private.assert_parent_usable('subjects', p_subject_id);
  if p_id is null then
    insert into public.topics (subject_id, name_en, name_mr, weight, weight_note, est_learn_min, sort_order, created_by, last_edited_by)
    values (p_subject_id, private.clean(p_name_en), private.clean(p_name_mr), coalesce(p_weight, 1),
            private.clean(p_weight_note), coalesce(p_est_learn_min, 60), coalesce(p_sort_order, 0), v_uid, v_uid)
    returning id into v_id;
  else
    perform private.assert_editable('topics', p_id);
    update public.topics set last_edited_by = v_uid, subject_id = p_subject_id, name_en = private.clean(p_name_en),
      name_mr = private.clean(p_name_mr), weight = coalesce(p_weight, 1), weight_note = private.clean(p_weight_note),
      est_learn_min = coalesce(p_est_learn_min, 60), sort_order = coalesce(p_sort_order, 0)
    where id = p_id;
  end if;
  perform private.write_audit(case when p_id is null then 'content.create' else 'content.update' end,
    'topics', v_id::text, jsonb_build_object('row', private.content_row('topics', v_id)), v_uid);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status workflow
-- ---------------------------------------------------------------------------
create function public.api_content_set_status(p_table text, p_id uuid, p_status public.content_status)
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
  v_child_table text;
  v_child_fk text;
  v_count bigint;
begin
  -- Explicit allow-list: the table name is used in dynamic SQL below.
  if p_table is null or p_table not in ('sources', 'exam_families', 'exams', 'exam_stages', 'papers',
      'syllabus_versions', 'subjects', 'topics') then
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
    -- A syllabus version must cite an official source (CLAUDE.md §3.2).
    if p_table = 'syllabus_versions' and v_row ->> 'source_id' is null then
      raise exception 'a syllabus version needs an official source before approval' using errcode = '22023';
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
      -- Retire bottom-up: nothing below may stay visible (review 0006 #2).
      select c.t, cp.fk_column into v_child_table, v_child_fk
      from (values ('exams'), ('exam_stages'), ('papers'), ('syllabus_versions'), ('subjects'), ('topics')) as c(t),
        lateral private.content_parent(c.t) cp
      where cp.parent_table = p_table;
      if v_child_table is not null then
        execute format('select count(*) from public.%I where %I = $1 and status <> ''retired''', v_child_table, v_child_fk)
          into v_count using p_id;
        if v_count > 0 then
          raise exception 'retire the % items below this one first', v_count using errcode = '22023';
        end if;
      end if;
      if p_table = 'sources' and (
        exists (select 1 from public.papers where source_id = p_id and status <> 'retired')
        or exists (select 1 from public.syllabus_versions where source_id = p_id and status <> 'retired')
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
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.api_content_save_source(uuid, public.source_kind, text, text, text, date, date, text) from public, anon;
revoke all on function public.api_content_save_family(uuid, text, text, text) from public, anon;
revoke all on function public.api_content_save_exam(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.api_content_save_stage(uuid, uuid, text, text, text, smallint) from public, anon;
revoke all on function public.api_content_save_paper(uuid, uuid, text, text, text, smallint, numeric, numeric, uuid) from public, anon;
revoke all on function public.api_content_save_syllabus(uuid, uuid, text, date, uuid) from public, anon;
revoke all on function public.api_content_save_subject(uuid, uuid, text, text, smallint) from public, anon;
revoke all on function public.api_content_save_topic(uuid, uuid, text, text, numeric, text, integer, smallint) from public, anon;
revoke all on function public.api_content_set_status(text, uuid, public.content_status) from public, anon;

grant execute on function public.api_content_save_source(uuid, public.source_kind, text, text, text, date, date, text) to authenticated;
grant execute on function public.api_content_save_family(uuid, text, text, text) to authenticated;
grant execute on function public.api_content_save_exam(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.api_content_save_stage(uuid, uuid, text, text, text, smallint) to authenticated;
grant execute on function public.api_content_save_paper(uuid, uuid, text, text, text, smallint, numeric, numeric, uuid) to authenticated;
grant execute on function public.api_content_save_syllabus(uuid, uuid, text, date, uuid) to authenticated;
grant execute on function public.api_content_save_subject(uuid, uuid, text, text, smallint) to authenticated;
grant execute on function public.api_content_save_topic(uuid, uuid, text, text, numeric, text, integer, smallint) to authenticated;
grant execute on function public.api_content_set_status(text, uuid, public.content_status) to authenticated;
