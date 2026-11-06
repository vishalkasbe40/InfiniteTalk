import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Reset password · ExamSaathi' };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Reset your password">
      <p className="muted">
        Enter your email and we will send you a link to choose a new password.
      </p>
      <ResetForm />
      <div className="links">
        <Link href="/login">Back to log in</Link>
      </div>
    </AuthCard>
  );
}
