import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../lib/auth/redirects';

describe('safeNextPath (no open redirects)', () => {
  it.each(['/dashboard', '/consent?next=/dashboard', '/account/password'])('allows %s', (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/%0d%0aSet-Cookie:x',
    '/foo\nbar',
    '',
    'dashboard',
    'x'.repeat(600),
  ])('rejects %j', (p) => {
    expect(safeNextPath(p)).toBe('/dashboard');
  });

  it('rejects non-strings and supports a custom fallback', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath(['/a'])).toBe('/dashboard');
    expect(safeNextPath(null, '/account/password')).toBe('/account/password');
  });
});

describe('safeNextPath with percent-encoding tricks', () => {
  it.each(['/%2f%2fevil.example', '/%5cevil.example', '/%E0%A4%A', '%2F%2Fevil.example'])(
    'rejects %j',
    (p) => {
      expect(safeNextPath(p)).toBe('/dashboard');
    },
  );
});
