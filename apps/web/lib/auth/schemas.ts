import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Please enter a valid email address.' }))
  .refine((v) => v.length <= 254, 'Please enter a valid email address.');

// 8+ characters (matches the Supabase setting); 72 is bcrypt's limit.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.');

const ticked = (message: string) => z.literal('on', { message });

// Sign-up only takes the email (+ an 18+ gate). The password and the recorded consents are given
// after the inbox owner clicks the confirmation link (review 0003 #6).
export const signUpSchema = z.object({
  email,
  age_18_plus: ticked('Please confirm that you are 18 or older.'),
});

export const signInSchema = z.object({ email, password: z.string().min(1).max(72) });
export const emailOnlySchema = z.object({ email });
export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'The two passwords do not match.' });

export const confirmParamsSchema = z.object({
  token_hash: z.string().min(10).max(512),
  type: z.enum(['email', 'recovery', 'signup', 'magiclink']),
  next: z.string().optional(),
});

/** First validation message, for showing a single friendly error. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the form and try again.';
}
