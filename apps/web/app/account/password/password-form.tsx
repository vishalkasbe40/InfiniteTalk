'use client';

import { useActionState } from 'react';
import { updatePassword } from '@/app/actions/auth';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';

export function PasswordForm() {
  const [state, action] = useActionState(updatePassword, idle);
  return (
    <form action={action} className="stack" aria-label="Choose a new password">
      <label>
        New password (at least 8 characters)
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
        />
      </label>
      <label>
        Type it again
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
        />
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
