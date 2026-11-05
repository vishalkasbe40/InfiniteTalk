import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStudent } from '@/lib/auth/guard';
import { loadPaperOptions, loadStudentGoal } from '@/lib/onboarding/data';
import { addDays, maxTargetDate, todayInIndia } from '@/lib/onboarding/schema';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: 'Your preparation · ExamSaathi' };

export default async function OnboardingPage() {
  const { supabase } = await requireStudent('/onboarding');
  const [papers, goal] = await Promise.all([loadPaperOptions(supabase), loadStudentGoal(supabase)]);
  const today = todayInIndia();

  return (
    <main>
      <p className="brand">
        <Link href="/dashboard">ExamSaathi</Link>
      </p>
      <h1>{goal ? 'Update your preparation' : 'Set up your preparation'}</h1>
      <p className="muted">Four quick questions. You can change your answers at any time.</p>
      {papers.length === 0 ? (
        <p className="notice">No exams are available yet. Please check back soon.</p>
      ) : (
        <OnboardingForm
          papers={papers}
          goal={goal}
          minDate={addDays(today, 1)}
          maxDate={maxTargetDate(today)}
        />
      )}
    </main>
  );
}
