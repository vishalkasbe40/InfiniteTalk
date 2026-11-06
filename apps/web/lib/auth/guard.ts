import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createUserClient } from '@/lib/supabase/server';
import { hasRecentEmailLinkAuth, type AmrEntry } from './amr';
import { loadMissingConsents } from './consent-server';

// Per-request caches (React cache): a layout and its page share one auth lookup (review 0005 #12).
export const currentSession = cache(async () => {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

/** Verified JWT claims (aal, amr) for the current session. */
export const currentClaims = cache(async () => {
  const { supabase } = await currentSession();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims ?? {}) as { aal?: string; amr?: AmrEntry[] };
});

const currentMissingConsents = cache(async () => {
  const { supabase } = await currentSession();
  return loadMissingConsents(supabase);
});

/**
 * Every student page and server action starts with one of these (review 0003 #13), so a new
 * page cannot forget the auth or consent check. The proxy redirect is only a convenience.
 */
export async function requireUser(next: string) {
  const { supabase, user } = await currentSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

/** Signed in AND has accepted the current privacy notice, terms and 18+ confirmation. */
export async function requireStudent(next: string) {
  const ctx = await requireUser(next);
  if ((await currentMissingConsents()).length > 0) {
    redirect(`/consent?next=${encodeURIComponent(next)}`);
  }
  return ctx;
}

/** Whether this session came from an email link in the last 15 minutes (see amr.ts). */
export async function sessionFromRecentEmailLink(): Promise<boolean> {
  return hasRecentEmailLinkAuth((await currentClaims()).amr, Math.floor(Date.now() / 1000));
}
