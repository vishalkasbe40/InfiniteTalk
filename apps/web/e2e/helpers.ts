import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

// Test-only helpers. Keys are the local stack's throwaway keys (CI), never real ones.
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const newEmail = (tag: string) => `e2e-${tag}-${randomUUID().slice(0, 8)}@example.test`;
export const PASSWORD = 'correct-horse-battery';

export async function invite(email: string) {
  const { error } = await admin.from('beta_invites').insert({ email, note: 'e2e' });
  expect(error).toBeNull();
}

/** A confirmed user with all current consents, created directly (fast path for other tests). */
export async function createConfirmedStudent(email: string, password = PASSWORD) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const docs = await admin.from('consent_documents').select('kind, version, published_at');
  const latest = new Map<string, { version: string; at: string }>();
  for (const d of docs.data ?? []) {
    const prev = latest.get(d.kind);
    if (!prev || d.published_at > prev.at)
      latest.set(d.kind, { version: d.version, at: d.published_at });
  }
  const rows = ['privacy_notice', 'terms', 'age_18_plus'].map((kind) => ({
    user_id: data.user!.id,
    kind,
    version: latest.get(kind)!.version,
    granted: true,
  }));
  expect((await admin.from('consents').insert(rows)).error).toBeNull();
  return data.user!.id;
}

export async function userExists(email: string): Promise<boolean> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.some((u) => u.email === email);
}

interface MailSummary {
  ID: string;
}

async function messagesTo(email: string): Promise<MailSummary[]> {
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { messages?: MailSummary[] };
  return body.messages ?? [];
}

/** Wait for the newest email to `email` and return the /auth/confirm link inside it. */
export async function linkFromEmail(email: string, minCount = 1): Promise<string> {
  let found: MailSummary[] = [];
  await expect
    .poll(async () => (found = await messagesTo(email)).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(minCount);
  const res = await fetch(`${mailpit}/api/v1/message/${found[0]!.ID}`);
  const msg = (await res.json()) as { HTML: string };
  const match = msg.HTML.match(/href="([^"]*\/auth\/confirm\?[^"]+)"/);
  expect(match, 'confirm link in email').not.toBeNull();
  return match![1]!.replaceAll('&amp;', '&');
}

export async function emailCount(email: string) {
  return (await messagesTo(email)).length;
}

/** Open the email link (shows a Continue page) and press Continue. */
export async function followEmailLink(page: Page, email: string, minCount = 1) {
  await page.goto(await linkFromEmail(email, minCount));
  await page.getByRole('button', { name: /^Continue/ }).click();
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  const form = page.getByRole('form', { name: 'Log in with password' });
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Log in' }).click();
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as an authenticator app computes it. Test-only. */
export function totp(base32Secret: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of base32Secret.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Wait until a fresh 30-second TOTP window starts, so the next code differs from the last one. */
export async function nextTotpWindow() {
  const ms = 30_000 - (Date.now() % 30_000) + 1_000;
  await new Promise((r) => setTimeout(r, ms));
}

export async function makeAdmin(userId: string) {
  const { error } = await admin.from('user_roles').insert({ user_id: userId, role: 'admin' });
  expect(error).toBeNull();
}

/** Log in with a one-time link from the email (an "email-link" session). */
export async function logInWithEmailLink(page: Page, email: string, previousEmails = 0) {
  await page.goto('/login');
  const form = page.getByRole('form', { name: 'Email me a log-in link' });
  await form.getByLabel('Email').fill(email);
  await form.getByRole('button', { name: 'Email me a log-in link' }).click();
  await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
  await followEmailLink(page, email, previousEmails + 1);
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** A new admin who has set up an authenticator; the page is left on /admin. */
export async function becomeVerifiedAdmin(
  page: Page,
  role: 'admin' | 'content_reviewer' = 'admin',
) {
  const email = newEmail(role === 'admin' ? 'admin' : 'reviewer');
  const id = await createConfirmedStudent(email);
  const { error } = await admin.from('user_roles').insert({ user_id: id, role });
  expect(error).toBeNull();
  await logInWithEmailLink(page, email);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Set up my authenticator app' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await page.getByLabel(/6-digit code/).fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and continue' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return { email, secret };
}
