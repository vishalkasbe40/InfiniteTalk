import 'server-only';
import { z } from 'zod';

// Server-only configuration, validated on first use (not at build time).
// Nothing here is sent to the browser: the browser never talks to Supabase directly.
const publicSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  APP_BASE_URL: z.url(),
});

export type AppEnv = z.infer<typeof publicSchema>;

export function getEnv(): AppEnv {
  const parsed = publicSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${names}`);
  }
  return parsed.data;
}

export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 20) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return key;
}
