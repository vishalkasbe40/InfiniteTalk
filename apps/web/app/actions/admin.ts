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

/** Step 1 of setup: create a new authenticator factor and show its QR code. */
export async function startTotpEnrolment(): Promise<MfaState> {
  const { supabase } = await requireStaffBeforeMfa('/admin/mfa');
  // Remove abandoned, never-verified factors first so they don't pile up.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `ExamSaathi admin ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data)
    return { status: 'error', message: 'Could not start the set-up. Please try again.' };
  return { status: 'enrol', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Step 2 of setup (form carries the new factor id), or a normal sign-in (no id: use the user's
 * verified authenticator). Any id from the form must be one of the signed-in user's own factors.
 */
export async function verifyTotp(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const { supabase } = await requireStaffBeforeMfa('/admin/mfa');
  const code = codeSchema.safeParse(fd.get('code'));
  if (!code.success) {
    return { status: 'error', message: code.error.issues[0]?.message ?? 'Invalid code.' };
  }
  const requested = fd.get('factor_id');
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const own = (factors?.all ?? []).filter((f) => f.factor_type === 'totp');
  const factorId =
    typeof requested === 'string' && requested
      ? own.find((f) => f.id === requested)?.id
      : own.find((f) => f.status === 'verified')?.id;
  if (!factorId) return { status: 'error', message: 'Please start the set-up again.' };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) {
    return {
      status: 'error',
      message: 'That code did not work. Check the time on your phone and try the newest code.',
    };
  }
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

export async function revokeInvite(fd: FormData): Promise<void> {
  const { supabase } = await requireStaff('/admin/invites');
  const id = z.uuid().safeParse(fd.get('id'));
  if (id.success) await supabase.rpc('api_admin_revoke_invite', { p_id: id.data });
  revalidatePath('/admin/invites');
}
