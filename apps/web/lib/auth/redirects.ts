/**
 * Only allow same-site relative paths as post-login destinations (no open redirects).
 * Rejects absolute URLs, protocol-relative `//host`, backslash tricks and control characters.
 */
export function safeNextPath(next: unknown, fallback = '/dashboard'): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  // Check both the raw and the percent-decoded form (e.g. %0d%0a, %5c, %2f%2f).
  for (const v of [next, decoded]) {
    if (/[\u0000-\u001f\u007f\\]/.test(v) || v.startsWith('//')) return fallback;
  }
  try {
    const url = new URL(next, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
