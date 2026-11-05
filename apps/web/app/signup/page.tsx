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
      <p className="muted">
        We will email you a link. After clicking it, you will choose your password and review our
        privacy notice and terms.
      </p>
      <SignUpForm />
      <div className="links">
        <Link href="/login">Already have an account? Log in</Link>
      </div>
    </AuthCard>
  );
}
