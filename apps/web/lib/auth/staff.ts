import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { requireStudent } from './guard';

export type StaffRole = 'admin' | 'content_reviewer';

/** The signed-in user's staff roles (their own user_roles rows are readable). */
async function staffRoles(supabase: Awaited<ReturnType<typeof requireStudent>>['supabase']) {
  const { data, error } = await supabase.from('user_roles').select('role');
  if (error) throw new Error('could not load roles');
  return data
    .map((r) => r.role as string)
    .filter((r): r is StaffRole => r === 'admin' || r === 'content_reviewer');
}

async function sessionAal(supabase: Awaited<ReturnType<typeof requireStudent>>['supabase']) {
  const { data } = await supabase.auth.getClaims();
  return (data?.claims as { aal?: string } | undefined)?.aal ?? 'aal1';
}

/**
 * Staff pages: signed in, current consents, one of `roles`, AND a two-step (aal2) session.
 * Non-staff get a plain 404 (the admin area is not advertised). The database enforces the same
 * rules on every admin write (private.has_role requires aal2), so this is not the only guard.
 */
export async function requireStaff(next: string, roles: StaffRole[] = ['admin']) {
  const ctx = await requireStudent(next);
  const mine = await staffRoles(ctx.supabase);
  if (!mine.some((r) => roles.includes(r))) notFound();
  if ((await sessionAal(ctx.supabase)) !== 'aal2') {
    redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
  }
  return { ...ctx, roles: mine };
}

/** For the two-step setup page itself: staff role required, aal2 not yet. */
export async function requireStaffBeforeMfa(next: string) {
  const ctx = await requireStudent(next);
  const mine = await staffRoles(ctx.supabase);
  if (mine.length === 0) notFound();
  return { ...ctx, roles: mine, aal: await sessionAal(ctx.supabase) };
}

export async function isStaff(supabase: Awaited<ReturnType<typeof requireStudent>>['supabase']) {
  return (await staffRoles(supabase)).length > 0;
}
