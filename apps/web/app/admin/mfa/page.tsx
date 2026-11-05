import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
  const { supabase, aal } = await requireStaffBeforeMfa('/admin/mfa');
  if (aal === 'aal2') redirect(next);
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
      {hasVerified ? <ChallengeForm next={next} /> : <EnrolForm next={next} />}
    </AuthCard>
  );
}
