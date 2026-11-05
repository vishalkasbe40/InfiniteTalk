// The browser never needs to read the session (no client-side Supabase), so cookies are
// httpOnly: injected scripts cannot steal them (architecture §5).
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
