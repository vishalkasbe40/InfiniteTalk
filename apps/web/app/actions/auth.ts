'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { getEnv } from '@/lib/env';
import {
  currentVersions,
  loadConsentDocuments,
  loadMissingConsents,
} from '@/lib/auth/consent-server';
import { MESSAGES, type FormState } from '@/lib/auth/form-state';
import { requireUser, sessionFromRecentEmailLink } from '@/lib/auth/guard';
import { safeNextPath } from '@/lib/auth/redirects';
import {
  confirmParamsSchema,
  emailOnlySchema,
  firstIssue,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/auth/schemas';
import { createAdminClient, createAnonServerClient } from '@/lib/supabase/admin';
import { createUserClient } from '@/lib/supabase/server';

const formObject = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'));

type EmailStatus = 'none' | 'unconfirmed' | 'confirmed';

async function emailStatus(email: string): Promise<EmailStatus> {
  const { data, error } = await createAdminClient().rpc('svc_auth_email_status', {
    p_email: email,
  });
  if (error) throw new Error('email status lookup failed');
  return data as EmailStatus;
}

/**
 * Invite-only sign-up (architecture §5; review 0003 #6/#7).
 * Only the email is collected here. The account has NO password and NO consents until the owner
 * of the inbox clicks the confirmation link, chooses a password and accepts the documents.
 * So nobody who merely knows an invited address can set the password or consent for them.
 * The response is identical for invited, uninvited and existing emails.
 */
export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { email } = parsed.data;
  const sent: FormState = { status: 'sent', message: MESSAGES.signUpSent };

  try {
    const admin = createAdminClient();
    const invite = await admin
      .from('beta_invites')
      .select('id, used_at')
      .eq('email', email)
      .maybeSingle();
    if (invite.error) return { status: 'error', message: MESSAGES.unavailable };
    if (!invite.data) return sent;

    const status = await emailStatus(email);
    if (status === 'confirmed') return sent;

    let createdId: string | undefined;
    if (status === 'none') {
      if (invite.data.used_at) return sent;
      const created = await admin.auth.admin.createUser({ email, email_confirm: false });
      if (created.error && created.error.code !== 'email_exists') {
        return { status: 'error', message: MESSAGES.unavailable };
      }
      createdId = created.data.user?.id;
    }

    // An unconfirmed account exists: (re)send the confirmation email. Re-sending on a repeat
    // sign-up helps a student whose first email was lost (review 0003 #7b).
    const resent = await createAnonServerClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${getEnv().APP_BASE_URL}/account/password` },
    });
    if (resent.error) return { status: 'error', message: MESSAGES.emailFailed };

    if (!invite.data.used_at) {
      await admin
        .from('beta_invites')
        .update({ used_at: new Date().toISOString(), used_by: createdId ?? null })
        .eq('id', invite.data.id)
        .is('used_at', null);
    }
    return sent;
  } catch {
    return { status: 'error', message: MESSAGES.unavailable };
  }
}

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: MESSAGES.badLogin };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: 'error', message: MESSAGES.badLogin };
  redirect(safeNextPath(fd.get('next')));
}

/**
 * Log-in link. Sent only to confirmed accounts: for an unconfirmed account Supabase would clear
 * its password (review 0003 #5). Work happens after the response, so response time does not
 * reveal whether an account exists (review 0003 #10).
 */
export async function sendMagicLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { email } = parsed.data;
  const redirectTo = `${getEnv().APP_BASE_URL}/dashboard`;
  after(async () => {
    if ((await emailStatus(email)) !== 'confirmed') return;
    await createAnonServerClient().auth.signInWithOtp({
      email,
      // Never create an account from a log-in link (review 0001 #8).
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
  });
  return { status: 'sent', message: MESSAGES.magicLinkSent };
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { email } = parsed.data;
  const redirectTo = `${getEnv().APP_BASE_URL}/account/password`;
  after(async () => {
    await createAnonServerClient().auth.resetPasswordForEmail(email, { redirectTo });
  });
  return { status: 'sent', message: MESSAGES.resetSent };
}

/**
 * Second step for links in our emails. GET /auth/confirm only shows a "Continue" button; the
 * token is used here, in a POST with Next's Origin check, so a link alone cannot log someone
 * into another account (login CSRF) and email scanners cannot use it up (review 0003 #4).
 */
export async function confirmEmailLink(fd: FormData): Promise<void> {
  const parsed = confirmParamsSchema.safeParse(formObject(fd));
  if (!parsed.success) redirect('/login?error=link');
  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({
    type: parsed.data.type,
    token_hash: parsed.data.token_hash,
  });
  if (error) redirect('/login?error=link');
  const fallback = parsed.data.type === 'recovery' ? '/account/password' : '/dashboard';
  redirect(safeNextPath(parsed.data.next, fallback));
}

/** Only allowed shortly after arriving from an email link (review 0003 #13). */
export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireUser('/account/password');
  if (!(await sessionFromRecentEmailLink(supabase))) {
    return { status: 'error', message: MESSAGES.needFreshLink };
  }
  const parsed = newPasswordSchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: 'error',
      message:
        error.code === 'weak_password'
          ? 'That password is too easy to guess. Please choose a longer or less common one.'
          : 'Could not save your password. Please try again.',
    };
  }
  redirect('/dashboard');
}

/** Consent for current document versions. Versions come from the server, never the form. */
export async function recordConsents(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireUser('/consent');
  const missing = await loadMissingConsents(supabase);
  if (missing.some((kind) => fd.get(kind) !== 'on')) {
    return { status: 'error', message: 'Please tick every box to continue.' };
  }
  const versions = currentVersions(await loadConsentDocuments(supabase));
  for (const kind of missing) {
    const { error } = await supabase.rpc('api_record_consent', {
      p_kind: kind,
      p_version: versions[kind],
      p_granted: true,
    });
    if (error) return { status: 'error', message: MESSAGES.unavailable };
  }
  redirect(safeNextPath(fd.get('next')));
}

export async function signOut(): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect('/login');
}
