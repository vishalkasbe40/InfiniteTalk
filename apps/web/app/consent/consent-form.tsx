'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { recordConsents } from '@/app/actions/auth';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';
import type { RequiredConsent } from '@/lib/auth/consent';

const LABELS: Record<RequiredConsent, React.ReactNode> = {
  age_18_plus: 'I confirm that I am 18 years old or older.',
  privacy_notice: (
    <>
      I have read the updated{' '}
      <Link href="/privacy" target="_blank">
        privacy notice
      </Link>
      .
    </>
  ),
  terms: (
    <>
      I accept the updated{' '}
      <Link href="/terms" target="_blank">
        terms of use
      </Link>
      .
    </>
  ),
};

export function ConsentForm({ missing, next }: { missing: RequiredConsent[]; next: string }) {
  const [state, action] = useActionState(recordConsents, idle);
  return (
    <form action={action} className="stack" aria-label="Review and accept">
      <input type="hidden" name="next" value={next} />
      {missing.map((kind) => (
        <label className="check" key={kind}>
          <input type="checkbox" name={kind} required />
          <span>{LABELS[kind]}</span>
        </label>
      ))}
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Continue</SubmitButton>
    </form>
  );
}
