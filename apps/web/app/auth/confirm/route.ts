import { type NextRequest, NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/auth/redirects';
import { confirmParamsSchema } from '@/lib/auth/schemas';
import { createUserClient } from '@/lib/supabase/server';

// Landing point for links in our emails (confirm sign-up, log-in link, password reset).
// Uses token_hash verification, so the link works on any device (not tied to a PKCE cookie).
export async function GET(request: NextRequest) {
  const params = confirmParamsSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const fail = new URL('/login?error=link', request.nextUrl.origin);
  if (!params.success) return NextResponse.redirect(fail);

  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({
    type: params.data.type,
    token_hash: params.data.token_hash,
  });
  if (error) return NextResponse.redirect(fail);

  const fallback = params.data.type === 'recovery' ? '/account/password' : '/dashboard';
  return NextResponse.redirect(
    new URL(safeNextPath(params.data.next, fallback), request.nextUrl.origin),
  );
}
