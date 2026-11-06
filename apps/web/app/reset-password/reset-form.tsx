'use client';

import { useActionState } from 'react';
import { requestPasswordReset } from '@/app/actions/auth';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';

export function ResetForm() {
  const [state, action] = useActionState(requestPasswordReset, idle);
  return (
    <form action={action} className="stack" aria-label="Reset your password">
      <label>
        Email
        <input type="email" name="email" autoComplete="email" required maxLength={254} />
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
