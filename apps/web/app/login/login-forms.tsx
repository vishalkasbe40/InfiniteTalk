'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { sendMagicLink, signIn } from '@/app/actions/auth';
import { FormMessage } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { idle } from '@/lib/auth/form-state';

export function LoginForms({ next }: { next: string }) {
  const [pwState, pwAction] = useActionState(signIn, idle);
  const [linkState, linkAction] = useActionState(sendMagicLink, idle);
  return (
    <>
      <form action={pwAction} className="stack" aria-label="Log in with password">
        <input type="hidden" name="next" value={next} />
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={72}
          />
        </label>
        <FormMessage state={pwState} />
        <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
      </form>
      <div className="links">
        <Link href="/reset-password">Forgot your password?</Link>
        <Link href="/signup">Have an invitation? Create your account</Link>
      </div>
      <hr />
      <form action={linkAction} className="stack" aria-label="Email me a log-in link">
        <p className="muted">Or get a one-time log-in link by email:</p>
        <label>
          Email
          <input type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <FormMessage state={linkState} />
        <SubmitButton pendingText="Sending…">Email me a log-in link</SubmitButton>
      </form>
    </>
  );
}
