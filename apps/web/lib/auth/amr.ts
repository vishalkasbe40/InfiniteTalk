/** Authentication-method entries from the Supabase JWT `amr` claim. */
export type AmrEntry = { method: string; timestamp: number } | string;

/**
 * True when the session was established by an email link (sign-up confirmation, log-in link or
 * password reset) within the last `maxAgeSeconds`. Password changes are only allowed then, so a
 * hijacked or shared session cannot silently take over the account (review 0003 #13).
 */
export function hasRecentEmailLinkAuth(
  amr: readonly AmrEntry[] | undefined,
  nowSeconds: number,
  maxAgeSeconds = 15 * 60,
): boolean {
  return (amr ?? []).some(
    (e) =>
      typeof e === 'object' &&
      e.method !== 'password' &&
      e.method !== 'anonymous' &&
      nowSeconds - e.timestamp >= 0 &&
      nowSeconds - e.timestamp <= maxAgeSeconds,
  );
}
