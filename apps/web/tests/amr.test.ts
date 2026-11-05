import { describe, expect, it } from 'vitest';
import { hasRecentEmailLinkAuth } from '../lib/auth/amr';

const now = 1_800_000_000;

describe('hasRecentEmailLinkAuth', () => {
  it('accepts a recent email-link or recovery session', () => {
    expect(hasRecentEmailLinkAuth([{ method: 'otp', timestamp: now - 60 }], now)).toBe(true);
    expect(hasRecentEmailLinkAuth([{ method: 'recovery', timestamp: now - 600 }], now)).toBe(true);
  });

  it('rejects password sessions, old links, future timestamps and missing claims', () => {
    expect(hasRecentEmailLinkAuth([{ method: 'password', timestamp: now }], now)).toBe(false);
    expect(hasRecentEmailLinkAuth([{ method: 'otp', timestamp: now - 3600 }], now)).toBe(false);
    expect(hasRecentEmailLinkAuth([{ method: 'otp', timestamp: now + 60 }], now)).toBe(false);
    expect(hasRecentEmailLinkAuth(['otp'], now)).toBe(false);
    expect(hasRecentEmailLinkAuth(undefined, now)).toBe(false);
  });
});
