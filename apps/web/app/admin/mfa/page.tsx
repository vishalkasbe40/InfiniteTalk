import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { AuthCard } from '@/components/auth-card';
import { safeNextPath } from '@/lib/auth/redirects';
import { requireStaffBeforeMfa } from '@/lib/auth/staff';
import { ChallengeForm, EnrolForm } from './mfa-forms';

export const metadata: Metadata = { title: 'Two-step verification · ExamSaathi admin' };

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next, '/admin');
  const { supabase, freshTotp, emailLinkRecent } = await requireStaffBeforeMfa('/admin/mfa');
  if (freshTotp) redirect(next);
  const { data } = await supabase.auth.mfa.listFactors();
  const hasVerified = (data?.all ?? []).some(
    (f) => f.factor_type === 'totp' && f.status === 'verified',
  );

  return (
    <AuthCard title="Two-step verification">
      <p className="muted">
        The admin area protects students’ data, so it needs a code from your phone as well as your
        password.
      </p>
      {hasVerified ? (
        <>
          <ChallengeForm next={next} />
          <p className="muted small">
            Lost your phone? Use a backup authenticator if you added one. Otherwise follow the “lost
            authenticator” steps in the project’s runbook (docs/runbooks).
          </p>
        </>
      ) : emailLinkRecent ? (
        <EnrolForm next={next} />
      ) : (
        <>
          <p className="notice">
            For your security, setting up two-step verification for the first time needs a fresh
            log-in from an email link. Log out, choose <strong>Email me a log-in link</strong> on
            the log-in page, open the link, then come back here within 15 minutes.
          </p>
          <form action={signOut}>
            <button type="submit" className="btn btn-secondary">
              Log out
            </button>
          </form>
          <p>
            <Link href="/dashboard">Back to my dashboard</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
