'use client';

import { useActionState } from 'react';
import { revokeInvite } from '@/app/actions/admin';
import { idle } from '@/lib/auth/form-state';

export function RevokeButton({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState(revokeInvite, idle);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <span>Not used yet · </span>
      <button
        type="submit"
        className="link-button"
        disabled={pending}
        aria-label={`Cancel invitation for ${email}`}
      >
        {pending ? 'Cancelling…' : 'Cancel'}
      </button>
      {state.status === 'error' && (
        <span className="msg-inline-error" role="alert">
          {' '}
          {state.message}
        </span>
      )}
    </form>
  );
}
