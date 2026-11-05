import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getEnv } from '@/lib/env';
import { sessionCookieOptions } from './cookie-options';

/**
 * User-scoped Supabase client for server components, server actions and route handlers.
 * Acts as the signed-in user, so RLS applies (ADR 0003). Session lives in httpOnly cookies.
 */
export async function createUserClient() {
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only. The proxy refreshes
          // the session cookie on every request, so this is safe to ignore.
        }
      },
    },
  });
}
