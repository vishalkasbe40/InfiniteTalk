import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { MESSAGES } from '@/lib/auth/form-state';
import { requireUser, sessionFromRecentEmailLink } from '@/lib/auth/guard';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Choose your password · ExamSaathi' };

export default async function NewPasswordPage() {
  const { supabase } = await requireUser('/account/password');
  if (!(await sessionFromRecentEmailLink(supabase))) {
    return (
      <AuthCard title="Change your password">
        <p className="notice">{MESSAGES.needFreshLink}</p>
        <div className="links">
          <Link href="/reset-password">Send me a password link</Link>
          <Link href="/dashboard">Back to my dashboard</Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose your password">
      <p className="muted">You will use this with your email to log in.</p>
      <PasswordForm />
    </AuthCard>
  );
}
