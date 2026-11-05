'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUp } from '@/app/actions/auth';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';

export function SignUpForm() {
  const [state, action] = useActionState(signUp, idle);
  if (state.status === 'sent') return <FormMessage state={state} />;
  return (
    <form action={action} className="stack" aria-label="Create your account">
      <label>
        Email (the one your invitation was sent to)
        <input type="email" name="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        Password (at least 8 characters)
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
        />
      </label>
      <label className="check">
        <input type="checkbox" name="age_18_plus" required />
        <span>I confirm that I am 18 years old or older.</span>
      </label>
      <label className="check">
        <input type="checkbox" name="privacy_notice" required />
        <span>
          I have read the{' '}
          <Link href="/privacy" target="_blank">
            privacy notice
          </Link>
          .
        </span>
      </label>
      <label className="check">
        <input type="checkbox" name="terms" required />
        <span>
          I accept the{' '}
          <Link href="/terms" target="_blank">
            terms of use
          </Link>
          .
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating account…">Create my account</SubmitButton>
    </form>
  );
}
