const UNSAFE = /[\u0000-\u001f\u007f\\]/;

/**
 * Only allow same-site relative paths as post-login destinations (no open redirects).
 * The checks run on the raw input, on its percent-decoded form AND on the normalised result,
 * because URL parsing removes dot-segments: "/.//evil.example" normalises to "//evil.example"
 * (review 0003 #1).
 */
export function safeNextPath(next: unknown, fallback = '/dashboard'): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > 512) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  for (const v of [next, decoded]) {
    if (!v.startsWith('/') || v.startsWith('//') || UNSAFE.test(v)) return fallback;
  }
  try {
    const url = new URL(next, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    const result = url.pathname + url.search;
    if (result.startsWith('//') || UNSAFE.test(result) || /^\/%2f/i.test(result)) return fallback;
    return result;
  } catch {
    return fallback;
  }
}
