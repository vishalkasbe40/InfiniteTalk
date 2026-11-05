import { randomUUID } from 'node:crypto';
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
