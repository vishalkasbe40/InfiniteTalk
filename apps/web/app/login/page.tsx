import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { safeNextPath } from '@/lib/auth/redirects';
import { LoginForms } from './login-forms';

export const metadata: Metadata = { title: 'Log in · ExamSaathi' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AuthCard title="Log in">
      {params.error === 'link' && (
        <p className="msg msg-error" role="alert">
          That link is invalid or has expired. Please log in or request a new link.
        </p>
      )}
      <LoginForms next={safeNextPath(params.next)} />
    </AuthCard>
  );
}
