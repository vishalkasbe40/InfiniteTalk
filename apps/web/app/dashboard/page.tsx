import type { Metadata } from 'next';
import { signOut } from '@/app/actions/auth';
import { requireStudent } from '@/lib/auth/guard';

export const metadata: Metadata = { title: 'Dashboard · ExamSaathi' };

export default async function DashboardPage() {
  // Signed in + current consents, or redirect (review 0001 #8, review 0003 #13).
  await requireStudent('/dashboard');

  return (
    <main>
      <p className="brand">ExamSaathi</p>
      <h1>Welcome!</h1>
      <p>You are logged in. Thank you for joining the beta.</p>
      <p className="notice">
        Next, we will ask a few short questions about your exam and study time, then a diagnostic
        test. These steps are coming soon.
      </p>
      <form action={signOut}>
        <button type="submit" className="btn btn-secondary">
          Log out
        </button>
      </form>
    </main>
  );
}
