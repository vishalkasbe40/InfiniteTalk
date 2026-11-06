'use client';

import { useActionState } from 'react';
import { addInvite } from '@/app/actions/admin';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';

export function InviteForm() {
  const [state, action] = useActionState(addInvite, idle);
  const typed = state.status === 'error' ? state.values : undefined;
  return (
    <form
      key={JSON.stringify(state)}
      action={action}
      className="stack"
      aria-label="Add an invitation"
    >
      <label>
        Student’s email
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          defaultValue={typed?.email ?? ''}
        />
      </label>
      <label>
        Note (optional, only visible to admins)
        <input type="text" name="note" maxLength={200} defaultValue={typed?.note ?? ''} />
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Adding…">Add invitation</SubmitButton>
    </form>
  );
}
