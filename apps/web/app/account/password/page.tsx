import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { createUserClient } from '@/lib/supabase/server';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'New password · ExamSaathi' };

export default async function NewPasswordPage() {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?next=/account/password');
  return (
    <AuthCard title="Choose a new password">
      <PasswordForm />
    </AuthCard>
  );
}
