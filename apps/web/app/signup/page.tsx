import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { SignUpForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account · ExamSaathi' };

export default function SignUpPage() {
  return (
    <AuthCard title="Create your account">
      <p className="notice">
        ExamSaathi is in a small, invite-only beta. You can sign up with the email address your
        invitation was sent to.
      </p>
      <SignUpForm />
      <div className="links">
        <Link href="/login">Already have an account? Log in</Link>
      </div>
    </AuthCard>
  );
}
