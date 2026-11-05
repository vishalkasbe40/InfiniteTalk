'use server';

import { redirect } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { REQUIRED_CONSENTS } from '@/lib/auth/consent';
import {
  currentVersions,
  loadConsentDocuments,
  loadMissingConsents,
} from '@/lib/auth/consent-server';
import { MESSAGES, type FormState } from '@/lib/auth/form-state';
import { safeNextPath } from '@/lib/auth/redirects';
import {
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

/**
 * Invite-only sign-up (architecture §5, review 0001 #8/#9).
 * The response is identical whether or not the email is invited or already registered.
 */
export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { email, password } = parsed.data;
  const sent: FormState = { status: 'sent', message: MESSAGES.signUpSent };

  try {
    const admin = createAdminClient();
    const invite = await admin
      .from('beta_invites')
      .select('id, used_at')
      .eq('email', email)
      .maybeSingle();
    if (invite.error) return { status: 'error', message: MESSAGES.unavailable };
    if (!invite.data || invite.data.used_at) return sent;

    const versions = currentVersions(await loadConsentDocuments(admin));
    if (REQUIRED_CONSENTS.some((k) => !versions[k])) {
      return { status: 'error', message: MESSAGES.unavailable };
    }

    const created = await admin.auth.admin.createUser({ email, password, email_confirm: false });
    if (created.error || !created.data.user) return sent; // e.g. already registered
    const userId = created.data.user.id;

    // Record consent before anything else; without it, the account must not exist.
    const consent = await admin.from('consents').insert(
      REQUIRED_CONSENTS.map((kind) => ({
        user_id: userId,
        kind,
        version: versions[kind],
        granted: true,
      })),
    );
    if (consent.error) {
      await admin.auth.admin.deleteUser(userId);
      return { status: 'error', message: MESSAGES.unavailable };
    }

    await admin
      .from('beta_invites')
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq('id', invite.data.id)
      .is('used_at', null);

    // Send the confirmation email (template links to /auth/confirm).
    await createAnonServerClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${getEnv().APP_BASE_URL}/dashboard` },
    });
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

export async function sendMagicLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const supabase = createAnonServerClient();
  // shouldCreateUser: false — a log-in link must never create an account (review 0001 #8).
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${getEnv().APP_BASE_URL}/dashboard` },
  });
  return { status: 'sent', message: MESSAGES.magicLinkSent };
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  await createAnonServerClient().auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getEnv().APP_BASE_URL}/account/password`,
  });
  return { status: 'sent', message: MESSAGES.resetSent };
}

export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const parsed = newPasswordSchema.safeParse(formObject(fd));
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error)
    return { status: 'error', message: 'Could not update your password. Please try again.' };
  redirect('/dashboard');
}

/** Re-consent for current document versions. Versions come from the server, never the form. */
export async function recordConsents(_prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

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
