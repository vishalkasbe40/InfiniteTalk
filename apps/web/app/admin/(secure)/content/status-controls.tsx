'use client';

import { useActionState } from 'react';
import { setContentStatus } from '@/app/actions/content';
import { FormMessage } from '@/components/form-message';
import { idle } from '@/lib/auth/form-state';
import type { EntityKey } from '@/lib/content/entities';

const ACTIONS: Record<string, { to: string; label: string; secondary?: boolean }[]> = {
  draft: [
    { to: 'in_review', label: 'Send for review' },
    { to: 'retired', label: 'Discard draft', secondary: true },
  ],
  in_review: [
    { to: 'approved', label: 'Approve' },
    { to: 'draft', label: 'Send back to draft', secondary: true },
  ],
  approved: [{ to: 'retired', label: 'Retire', secondary: true }],
  retired: [],
};

export function StatusControls({
  entity,
  id,
  status,
}: {
  entity: EntityKey;
  id: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(setContentStatus, idle);
  const options = ACTIONS[status] ?? [];
  return (
    <div className="status-controls">
      {options.map((o) => (
        <form key={o.to} action={action}>
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={o.to} />
          <button
            type="submit"
            className={o.secondary ? 'btn btn-secondary' : 'btn'}
            disabled={pending}
          >
            {o.label}
          </button>
        </form>
      ))}
      {state.status !== 'idle' && <FormMessage state={state} />}
      {status === 'approved' && (
        <p className="why">
          Approved items can’t be edited. To change one, retire it and create a new item. Retire
          from the bottom up: items below must be retired first.
        </p>
      )}
      {status === 'in_review' && (
        <p className="why">
          Approve only after checking every fact against the cited official source.
        </p>
      )}
    </div>
  );
}
