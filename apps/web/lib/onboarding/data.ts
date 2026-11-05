import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PaperOption {
  id: string;
  label: string;
}

interface PaperRow {
  id: string;
  name_en: string;
  exam_stages: {
    name_en: string;
    exams: { name_en: string; exam_families: { name_en: string } | null } | null;
  } | null;
}

/** Approved exam papers a student can choose (RLS also hides anything unapproved). */
// The paper AND its stage, exam and family must be approved (review 0004 #2). `!inner` drops
// papers whose parents are missing or filtered out. The save RPC re-checks all of this and also
// requires an approved, in-effect syllabus version.
export async function loadPaperOptions(supabase: SupabaseClient): Promise<PaperOption[]> {
  const { data, error } = await supabase
    .from('papers')
    .select(
      'id, name_en, exam_stages!inner(name_en, status, exams!inner(name_en, status, exam_families!inner(name_en, status)))',
    )
    .eq('status', 'approved')
    .eq('exam_stages.status', 'approved')
    .eq('exam_stages.exams.status', 'approved')
    .eq('exam_stages.exams.exam_families.status', 'approved')
    .order('name_en');
  if (error) throw new Error('could not load exam papers');
  return (data as unknown as PaperRow[]).map((p) => ({
    id: p.id,
    label: [p.exam_stages?.exams?.name_en, p.exam_stages?.name_en, p.name_en]
      .filter(Boolean)
      .join(' · '),
  }));
}

export interface StudentGoal {
  paperId: string;
  paperLabel: string;
  targetDate: string;
  language: 'en' | 'mr';
  minutesByWeekday: number[]; // index 0 = Sunday
}

/** The signed-in student's active goal and weekly availability, or null if not set up yet. */
export async function loadStudentGoal(supabase: SupabaseClient): Promise<StudentGoal | null> {
  const [goal, avail, profile, papers] = await Promise.all([
    supabase
      .from('student_exam_goals')
      .select('paper_id, target_date')
      .eq('active', true)
      .maybeSingle(),
    supabase.from('study_availability').select('weekday, minutes'),
    supabase.from('profiles').select('preferred_language').maybeSingle(),
    loadPaperOptions(supabase),
  ]);
  if (goal.error || avail.error || profile.error) throw new Error('could not load your goal');
  const active = goal.data;
  if (!active) return null;
  const minutes = [0, 0, 0, 0, 0, 0, 0];
  for (const row of avail.data) minutes[row.weekday] = row.minutes;
  return {
    paperId: active.paper_id,
    paperLabel: papers.find((p) => p.id === active.paper_id)?.label ?? 'Your exam',
    targetDate: active.target_date,
    language: profile.data?.preferred_language === 'mr' ? 'mr' : 'en',
    minutesByWeekday: minutes,
  };
}
