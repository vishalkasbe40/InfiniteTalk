import { describe, expect, it } from 'vitest';
import { confirmParamsSchema, newPasswordSchema, signUpSchema } from '../lib/auth/schemas';

const valid = { email: '  Priya@Example.TEST ', age_18_plus: 'on' };

describe('auth form validation', () => {
  it('normalises the email and accepts a sign-up request', () => {
    const r = signUpSchema.safeParse(valid);
    expect(r.success && r.data.email).toBe('priya@example.test');
  });

  it('requires the 18+ box and a valid email; collects no password at sign-up', () => {
    expect(signUpSchema.safeParse({ email: valid.email }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
    const r = signUpSchema.safeParse({ ...valid, password: 'ignored-field' });
    expect(r.success && 'password' in r.data).toBe(false);
  });

  it('requires matching new passwords', () => {
    expect(newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgX' }).success).toBe(
      false,
    );
    expect(newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgh' }).success).toBe(
      true,
    );
  });

  it('only accepts known email-link types', () => {
    const base = { token_hash: 'a'.repeat(20) };
    expect(confirmParamsSchema.safeParse({ ...base, type: 'recovery' }).success).toBe(true);
    expect(confirmParamsSchema.safeParse({ ...base, type: 'invite' }).success).toBe(false);
    expect(confirmParamsSchema.safeParse({ type: 'email' }).success).toBe(false);
  });
});
