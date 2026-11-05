import 'server-only';
import { redirect } from 'next/navigation';
import { createUserClient } from '@/lib/supabase/server';
import { hasRecentEmailLinkAuth, type AmrEntry } from './amr';
import { loadMissingConsents } from './consent-server';

/**
 * Every student page and server action starts with one of these (review 0003 #13), so a new
 * page cannot forget the auth or consent check. The proxy redirect is only a convenience.
 */
export async function requireUser(next: string) {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user: data.user };
}

/** Signed in AND has accepted the current privacy notice, terms and 18+ confirmation. */
export async function requireStudent(next: string) {
  const ctx = await requireUser(next);
  if ((await loadMissingConsents(ctx.supabase)).length > 0) {
    redirect(`/consent?next=${encodeURIComponent(next)}`);
  }
  return ctx;
}

/** Whether this session came from an email link in the last 15 minutes (see amr.ts). */
export async function sessionFromRecentEmailLink(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims as { amr?: AmrEntry[] } | undefined)?.amr;
  return hasRecentEmailLinkAuth(amr, Math.floor(Date.now() / 1000));
}
