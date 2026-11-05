'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/lib/auth/form-state';
import { safeNextPath } from '@/lib/auth/redirects';
import { requireStaff, requireStaffBeforeMfa } from '@/lib/auth/staff';

export type MfaState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'enrol'; factorId: string; qr: string; secret: string };

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Please enter the 6-digit code from your app.');

/**
 * Step 1 of setup: create a new authenticator factor and show its QR code.
 * - First authenticator: only from a session started by an email link in the last 15 minutes, so a
 *   stolen password alone cannot register an attacker's phone (review 0005 #3).
 * - Backup authenticator: only with a fresh code from the existing one.
 */
export async function startTotpEnrolment(): Promise<MfaState> {
  const { supabase, freshTotp, emailLinkRecent } = await requireStaffBeforeMfa('/admin/mfa');
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const all = factors?.all ?? [];
  const hasVerified = all.some((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (hasVerified ? !freshTotp : !emailLinkRecent) {
    return {
      status: 'error',
      message: hasVerified
        ? 'Please verify with your current authenticator first.'
        : 'For your security, log in again with “Email me a log-in link”, then set up within 15 minutes.',
    };
  }
  // Remove abandoned, never-verified factors first so they don't pile up.
  for (const f of all) {
    if (f.factor_type === 'totp' && f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  });
  if (error || !data)
    return { status: 'error', message: 'Could not start the set-up. Please try again.' };
  return { status: 'enrol', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Step 2 of setup (form carries the new factor id), or a normal sign-in (no id: use a verified
 * authenticator). Any id from the form must be one of the signed-in user's own factors.
 * Failed codes are counted per user: 5 in 15 minutes locks verification (review 0005 #6).
 */
export async function verifyTotp(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const { supabase } = await requireStaffBeforeMfa('/admin/mfa');
  const code = codeSchema.safeParse(fd.get('code'));
  if (!code.success) {
    return { status: 'error', message: code.error.issues[0]?.message ?? 'Invalid code.' };
  }
  const guard = await supabase.rpc('api_mfa_guard');
  if (guard.error) {
    return {
      status: 'error',
      message:
        guard.error.code === '54000'
          ? 'Too many wrong codes. For your security, please wait 15 minutes and try again.'
          : 'Something went wrong. Please try again.',
    };
  }
  const requested = fd.get('factor_id');
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const own = (factors?.all ?? []).filter((f) => f.factor_type === 'totp');
  const enrolling = typeof requested === 'string' && requested.length > 0;
  const factorId = enrolling
    ? own.find((f) => f.id === requested && f.status === 'unverified')?.id
    : own.find((f) => f.status === 'verified')?.id;
  if (!factorId) return { status: 'error', message: 'Please start the set-up again.' };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) {
    await supabase.rpc('api_mfa_record', { p_event: 'verify_failed' });
    return {
      status: 'error',
      message: 'That code did not work. Check the time on your phone and try the newest code.',
    };
  }
  await supabase.rpc('api_mfa_record', { p_event: enrolling ? 'enrolled' : 'verified' });
  redirect(safeNextPath(fd.get('next'), '/admin'));
}

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Please enter a valid email address.' })),
  note: z.string().trim().max(200, 'Note is too long (200 characters max).').optional(),
});

export async function addInvite(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireStaff('/admin/invites');
  const values = { email: String(fd.get('email') ?? ''), note: String(fd.get('note') ?? '') };
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid input.',
      values,
    };
  }
  const { error } = await supabase.rpc('api_admin_add_invite', {
    p_email: parsed.data.email,
    p_note: parsed.data.note || null,
  });
  if (error) {
    const message =
      error.code === '23505'
        ? 'This email is already invited.'
        : error.code === '42501'
          ? 'Your two-step session has expired. Please verify again.'
          : 'Could not add the invitation. Please try again.';
    return { status: 'error', message, values };
  }
  revalidatePath('/admin/invites');
  return {
    status: 'sent',
    message: `Invitation added for ${parsed.data.email}. Ask them to sign up at /signup.`,
  };
}

export async function revokeInvite(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireStaff('/admin/invites');
  const id = z.uuid().safeParse(fd.get('id'));
  if (!id.success) return { status: 'error', message: 'Invalid request.' };
  const { error } = await supabase.rpc('api_admin_revoke_invite', { p_id: id.data });
  if (error) {
    return {
      status: 'error',
      message:
        error.code === '22023'
          ? 'This invitation was already used or cancelled.'
          : 'Could not cancel the invitation. Please try again.',
    };
  }
  revalidatePath('/admin/invites');
  return { status: 'sent', message: 'Invitation cancelled.' };
}
