import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { hasFreshTotp } from './amr';
import { currentClaims, currentSession, requireStudent, sessionFromRecentEmailLink } from './guard';

export type StaffRole = 'admin' | 'content_reviewer';

/**
 * The signed-in user's OWN staff roles. Filtered by user id: at aal2 an admin can read every
 * user's roles, so an unfiltered query would mix in other users' roles (review 0005 #2).
 */
export const currentStaffRoles = cache(async (): Promise<StaffRole[]> => {
  const { supabase, user } = await currentSession();
  if (!user) return [];
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
  if (error) throw new Error('could not load roles');
  return data
    .map((r) => r.role as string)
    .filter((r): r is StaffRole => r === 'admin' || r === 'content_reviewer');
});

async function freshTotp(): Promise<boolean> {
  const claims = await currentClaims();
  return hasFreshTotp(claims.aal, claims.amr, Math.floor(Date.now() / 1000));
}

/**
 * Staff pages: signed in, current consents, one of `roles`, AND an authenticator code entered in
 * the last 12 hours. Non-staff get a plain 404. The database enforces role + aal2 on every admin
 * read/write too (private.has_role), so this is not the only guard.
 */
export async function requireStaff(next: string, roles: StaffRole[] = ['admin']) {
  const ctx = await requireStudent(next);
  const mine = await currentStaffRoles();
  if (!mine.some((r) => roles.includes(r))) notFound();
  if (!(await freshTotp())) redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
  return { ...ctx, roles: mine };
}

/**
 * For the admin layout: only hides the area from non-staff. It never redirects, because a layout's
 * redirect would override the page's (with the wrong `next`, review 0005 #1); pages do the rest.
 */
export async function assertStaffMember() {
  const { user } = await currentSession();
  if (!user || (await currentStaffRoles()).length === 0) notFound();
}

/** For the two-step page itself: staff role required, a fresh code not yet. */
export async function requireStaffBeforeMfa(next: string) {
  const ctx = await requireStudent(next);
  const mine = await currentStaffRoles();
  if (mine.length === 0) notFound();
  return {
    ...ctx,
    roles: mine,
    freshTotp: await freshTotp(),
    emailLinkRecent: await sessionFromRecentEmailLink(),
  };
}

export async function isAdmin(): Promise<boolean> {
  return (await currentStaffRoles()).includes('admin');
}
