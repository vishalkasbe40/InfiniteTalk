import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { requireStudent } from '@/lib/auth/guard';
import { currentStaffRoles } from '@/lib/auth/staff';
import { loadStudentGoal } from '@/lib/onboarding/data';
import { daysUntil, formatMinutes, todayInIndia } from '@/lib/onboarding/schema';

export const metadata: Metadata = { title: 'Dashboard · ExamSaathi' };

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default async function DashboardPage() {
  // Signed in + current consents, or redirect (review 0001 #8, review 0003 #13).
  const { supabase } = await requireStudent('/dashboard');
  const [goal, staff] = await Promise.all([
    loadStudentGoal(supabase),
    currentStaffRoles().then((r) => r.length > 0),
  ]);

  return (
    <main>
      <p className="brand">ExamSaathi</p>
      <h1>Welcome!</h1>
      {goal ? <GoalSummary goal={goal} /> : <FirstRun />}
      {staff && (
        <p>
          <Link href="/admin">Admin area</Link>
        </p>
      )}
      <form action={signOut}>
        <button type="submit" className="btn btn-secondary">
          Log out
        </button>
      </form>
    </main>
  );
}

function FirstRun() {
  return (
    <section className="card" aria-labelledby="first-run">
      <h2 id="first-run">Let’s set up your preparation</h2>
      <p>
        Four quick questions about your exam, language, target date and study time (about 2
        minutes).
      </p>
      <Link className="btn" href="/onboarding">
        Start
      </Link>
    </section>
  );
}

function GoalSummary({ goal }: { goal: NonNullable<Awaited<ReturnType<typeof loadStudentGoal>>> }) {
  const days = daysUntil(goal.targetDate, todayInIndia());
  const weekly = goal.minutesByWeekday.reduce((a, b) => a + b, 0);
  const studyDays = goal.minutesByWeekday.filter((m) => m > 0).length;
  return (
    <section className="card" aria-labelledby="your-prep">
      <h2 id="your-prep">Your preparation</h2>
      <dl className="facts">
        <dt>Exam</dt>
        <dd>{goal.paperLabel}</dd>
        <dt>Your target date</dt>
        <dd>
          {dateFmt.format(new Date(`${goal.targetDate}T00:00:00Z`))}{' '}
          {days > 0
            ? `(${days} ${days === 1 ? 'day' : 'days'} from today)`
            : '(today or already passed)'}
        </dd>
        <dt>Study time</dt>
        <dd>
          {formatMinutes(weekly)} per week, on {studyDays} {studyDays === 1 ? 'day' : 'days'}
        </dd>
        <dt>Language</dt>
        <dd>{goal.language === 'mr' ? 'मराठी (Marathi)' : 'English'}</dd>
      </dl>
      {days <= 0 && (
        <p className="notice" role="status">
          Your target date has arrived or passed. Would you like to set a new one? Every bit of
          preparation still counts.
        </p>
      )}
      <p>
        <Link href="/onboarding">
          {days <= 0 ? 'Set a new target date' : 'Change these answers'}
        </Link>
      </p>
      <p className="notice">
        Next: a short diagnostic test to see where you stand, then your personal study plan. Coming
        soon.
      </p>
    </section>
  );
}
