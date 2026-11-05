'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { recordConsents } from '@/app/actions/auth';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';
import type { RequiredConsent } from '@/lib/auth/consent';

function label(kind: RequiredConsent, firstTime: boolean): React.ReactNode {
  const updated = firstTime ? '' : 'updated ';
  switch (kind) {
    case 'age_18_plus':
      return 'I confirm that I am 18 years old or older.';
    case 'privacy_notice':
      return (
        <>
          I have read the {updated}
          <Link href="/privacy" target="_blank">
            privacy notice
          </Link>
          .
        </>
      );
    case 'terms':
      return (
        <>
          I accept the {updated}
          <Link href="/terms" target="_blank">
            terms of use
          </Link>
          .
        </>
      );
  }
}

export function ConsentForm({
  missing,
  next,
  firstTime,
}: {
  missing: RequiredConsent[];
  next: string;
  firstTime: boolean;
}) {
  const [state, action] = useActionState(recordConsents, idle);
  return (
    <form action={action} className="stack" aria-label="Review and accept">
      <input type="hidden" name="next" value={next} />
      {missing.map((kind) => (
        <label className="check" key={kind}>
          <input type="checkbox" name={kind} required />
          <span>{label(kind, firstTime)}</span>
        </label>
      ))}
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Continue</SubmitButton>
    </form>
  );
}
