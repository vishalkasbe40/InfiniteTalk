'use client';

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
      <label className="check">
        <input type="checkbox" name="age_18_plus" required />
        <span>I am 18 years old or older.</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…">Send me the sign-up link</SubmitButton>
    </form>
  );
}
