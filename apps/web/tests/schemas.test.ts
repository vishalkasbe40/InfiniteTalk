import { describe, expect, it } from 'vitest';
import { confirmParamsSchema, newPasswordSchema, signUpSchema } from '../lib/auth/schemas';

const valid = {
  email: '  Priya@Example.TEST ',
  password: 'correct horse',
  age_18_plus: 'on',
  privacy_notice: 'on',
  terms: 'on',
};

describe('auth form validation', () => {
  it('normalises the email and accepts a complete sign-up', () => {
    const r = signUpSchema.safeParse(valid);
    expect(r.success && r.data.email).toBe('priya@example.test');
  });

  it.each(['age_18_plus', 'privacy_notice', 'terms'])('requires the %s box', (box) => {
    const rest: Record<string, string> = { ...valid };
    delete rest[box];
    expect(signUpSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects short and over-long passwords and bad emails', () => {
    expect(signUpSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, password: 'x'.repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
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
