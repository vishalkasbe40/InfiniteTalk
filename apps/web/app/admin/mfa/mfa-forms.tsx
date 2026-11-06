'use client';

import { useActionState } from 'react';
import { startTotpEnrolment, verifyTotp, type MfaState } from '@/app/actions/admin';
import { SubmitButton } from '@/components/submit-button';

const idle: MfaState = { status: 'idle' };

function CodeField() {
  return (
    <label>
      6-digit code from your authenticator app
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
      />
    </label>
  );
}

function ErrorText({ state }: { state: MfaState }) {
  return state.status === 'error' ? (
    <p className="msg msg-error" role="alert">
      {state.message}
    </p>
  ) : null;
}

/** First-time set-up: show QR + secret, then confirm with a code. */
export function EnrolForm({ next }: { next: string }) {
  const [startState, start] = useActionState(startTotpEnrolment, idle);
  const [verifyState, verify] = useActionState(verifyTotp, idle);

  if (startState.status !== 'enrol') {
    return (
      <form action={start} className="stack">
        <ErrorText state={startState} />
        <SubmitButton pendingText="Preparing…">Set up my authenticator app</SubmitButton>
      </form>
    );
  }
  return (
    <form action={verify} className="stack" aria-label="Confirm authenticator">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="factor_id" value={startState.factorId} />
      <ol className="steps">
        <li>
          Open an authenticator app on your phone (for example Google or Microsoft Authenticator).
        </li>
        <li>Scan this QR code, or type the key below.</li>
      </ol>
      {/* QR code is an SVG data URI from Supabase (allowed by the CSP's img-src data:). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="qr"
        src={startState.qr}
        alt="QR code for your authenticator app"
        width={200}
        height={200}
      />
      <p className="small">
        Key: <code data-testid="totp-secret">{startState.secret}</code>
      </p>
      <CodeField />
      <ErrorText state={verifyState} />
      <SubmitButton pendingText="Checking…">Confirm and continue</SubmitButton>
    </form>
  );
}

/** Returning staff: just enter the current code. */
export function ChallengeForm({ next }: { next: string }) {
  const [state, verify] = useActionState(verifyTotp, idle);
  return (
    <form action={verify} className="stack" aria-label="Two-step verification">
      <input type="hidden" name="next" value={next} />
      <CodeField />
      <ErrorText state={state} />
      <SubmitButton pendingText="Checking…">Verify</SubmitButton>
    </form>
  );
}
