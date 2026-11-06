import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { loadMissingConsents } from '@/lib/auth/consent-server';
import { requireUser } from '@/lib/auth/guard';
import { safeNextPath } from '@/lib/auth/redirects';
import { ConsentForm } from './consent-form';

export const metadata: Metadata = { title: 'Please review · ExamSaathi' };

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath((await searchParams).next);
  const { supabase } = await requireUser('/consent');
  const missing = await loadMissingConsents(supabase);
  if (missing.length === 0) redirect(next);
  const { count } = await supabase.from('consents').select('id', { count: 'exact', head: true });
  const firstTime = (count ?? 0) === 0;
  return (
    <AuthCard title={firstTime ? 'Before you start' : 'Please review before continuing'}>
      <p className="muted">
        {firstTime
          ? 'Please read our privacy notice and terms, then tick each box to continue.'
          : 'Some of our documents have been updated. Please review and tick each box to continue.'}
      </p>
      <ConsentForm missing={missing} next={next} firstTime={firstTime} />
    </AuthCard>
  );
}
