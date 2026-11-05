import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { loadMissingConsents } from '@/lib/auth/consent-server';
import { safeNextPath } from '@/lib/auth/redirects';
import { createUserClient } from '@/lib/supabase/server';
import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Please review · ExamSaathi' };

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/consent');
  const missing = await loadMissingConsents(supabase);
  if (missing.length === 0) redirect(next);
  return (
    <AuthCard title="Please review before continuing">
      <p className="muted">
        Some of our documents have been updated, or we need your confirmation. Please review and
        tick each box to continue.
      </p>
      <ConsentForm missing={missing} next={next} />
    </AuthCard>
  );
}
