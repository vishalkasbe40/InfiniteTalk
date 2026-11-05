/** Authentication-method entries from the Supabase JWT `amr` claim. */
export type AmrEntry = { method: string; timestamp: number } | string;

/** True if any of `methods` was used to authenticate within the last `maxAgeSeconds`. */
export function hasRecentMethod(
  amr: readonly AmrEntry[] | undefined,
  methods: ReadonlySet<string>,
  nowSeconds: number,
  maxAgeSeconds: number,
): boolean {
  return (amr ?? []).some(
    (e) =>
      typeof e === 'object' &&
      methods.has(e.method) &&
      nowSeconds - e.timestamp >= 0 &&
      nowSeconds - e.timestamp <= maxAgeSeconds,
  );
}

// Only methods that prove control of the inbox. Not 'password' or 'totp' (an authenticator code
// proves the second factor, not the inbox).
const EMAIL_LINK_METHODS = new Set(['otp', 'magiclink', 'recovery', 'email/signup', 'invite']);
const TOTP_METHODS = new Set(['totp', 'mfa/totp']);

/**
 * True when the session was established by an email link (sign-up confirmation, log-in link or
 * password reset) within the last `maxAgeSeconds`. Password changes and first authenticator set-up
 * are only allowed then (reviews 0003 #13, 0005 #3).
 */
export function hasRecentEmailLinkAuth(
  amr: readonly AmrEntry[] | undefined,
  nowSeconds: number,
  maxAgeSeconds = 15 * 60,
): boolean {
  return hasRecentMethod(amr, EMAIL_LINK_METHODS, nowSeconds, maxAgeSeconds);
}

/** Admin pages need an authenticator code entered within the last 12 hours (review 0005 #5). */
export function hasFreshTotp(
  aal: string | undefined,
  amr: readonly AmrEntry[] | undefined,
  nowSeconds: number,
  maxAgeSeconds = 12 * 60 * 60,
): boolean {
  return aal === 'aal2' && hasRecentMethod(amr, TOTP_METHODS, nowSeconds, maxAgeSeconds);
}
