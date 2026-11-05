import type { FormState } from '@/lib/auth/form-state';

/** Announces form results to screen readers as well as showing them. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === 'idle') return <p className="sr-only" aria-live="polite" />;
  return (
    <p
      className={state.status === 'error' ? 'msg msg-error' : 'msg msg-ok'}
      role={state.status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}
