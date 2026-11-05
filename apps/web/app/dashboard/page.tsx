import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { loadMissingConsents } from '@/lib/auth/consent-server';
import { createUserClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard · ExamSaathi' };

export default async function DashboardPage() {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/dashboard');
  // Consent gate: the app is blocked until the current documents are accepted (review 0001 #8).
  if ((await loadMissingConsents(supabase)).length > 0) redirect('/consent?next=/dashboard');

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
