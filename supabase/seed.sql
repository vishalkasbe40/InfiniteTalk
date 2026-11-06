-- Local development / CI seed. CLEARLY FICTIONAL SAMPLE DATA (CLAUDE.md §10).
-- These are placeholders so onboarding can be built and tested. They are NOT the official MPSC
-- syllabus: no marks, durations, weights or topic lists here are official facts. The real taxonomy
-- is entered by the founder/content reviewer with cited official sources (backlog M1-8, M2-3).
-- Applied by `supabase start` / `supabase db reset` only; never run against production.

insert into public.exam_families (id, code, name_en, name_mr, status) values
  ('00000000-0000-4000-8000-000000000001', 'MPSC', 'MPSC (sample data)', null, 'approved');

insert into public.exams (id, family_id, code, name_en, state, status) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   'MPSC_RAJYASEVA', 'State Services (Rajyaseva) (sample data)', 'Maharashtra', 'approved');

insert into public.exam_stages (id, exam_id, code, name_en, sort_order, status) values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
   'PRELIMS', 'Preliminary examination (sample data)', 1, 'approved');

-- duration/marks deliberately left empty: they must come from a cited official source.
insert into public.papers (id, stage_id, code, name_en, status) values
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'GS1', 'General Studies Paper I (sample data)', 'approved');

insert into public.syllabus_versions (id, paper_id, label, effective_from, status) values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004',
   'SAMPLE placeholder syllabus - not official', '2026-01-01', 'approved');

insert into public.subjects (id, syllabus_version_id, name_en, sort_order, status) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000005', 'Sample subject A', 1, 'approved'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000005', 'Sample subject B', 2, 'approved');

insert into public.topics (subject_id, name_en, weight, weight_note, est_learn_min, sort_order, status) values
  ('00000000-0000-4000-8000-000000000101', 'Sample topic A1', 1, 'placeholder weight', 120, 1, 'approved'),
  ('00000000-0000-4000-8000-000000000101', 'Sample topic A2', 1, 'placeholder weight', 120, 2, 'approved'),
  ('00000000-0000-4000-8000-000000000102', 'Sample topic B1', 1, 'placeholder weight', 120, 1, 'approved');
