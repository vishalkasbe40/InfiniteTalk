import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getEnv, getServiceRoleKey } from '@/lib/env';

/**
 * SERVICE-ROLE client: bypasses RLS. Only for the narrow server-side jobs named in ADR 0003
 * (here: invite-only sign-up). Never import this from a client component or pass its results
 * to the browser unfiltered.
 */
export function createAdminClient() {
  return createClient(getEnv().SUPABASE_URL, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Anonymous server-side client without a session (e.g. to send a confirmation email). */
export function createAnonServerClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
