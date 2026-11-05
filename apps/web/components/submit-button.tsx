'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, pendingText }: { children: string; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
