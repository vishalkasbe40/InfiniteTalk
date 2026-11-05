import { expect, test } from '@playwright/test';
import {
  admin,
  createConfirmedStudent,
  emailCount,
  invite,
  linkFromEmail,
  logIn,
  newEmail,
  PASSWORD,
  userExists,
} from './helpers';

const SIGNUP_SENT = /If this email has a beta invitation/;

async function fillSignUp(page: import('@playwright/test').Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByLabel(/18 years old or older/).check();
  await page.getByLabel(/privacy notice/).check();
  await page.getByLabel(/terms of use/).check();
  await page.getByRole('button', { name: 'Create my account' }).click();
}

test.describe.serial('authentication', () => {
  test('protected pages send logged-out visitors to log in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test('pages carry a nonce-based CSP and load without CSP violations', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    const res = await page.goto('/login');
    expect(res?.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('an invited student signs up, confirms by email and reaches the dashboard', async ({
    page,
  }) => {
    const email = newEmail('signup');
    await invite(email);
    await fillSignUp(page, email);
    await expect(page.getByText(SIGNUP_SENT)).toBeVisible();

    // Account exists with consents recorded, but cannot log in before confirming.
    expect(await userExists(email)).toBe(true);
    await logIn(page, email);
    await expect(page.locator('p[role="alert"]')).toContainText(
      'incorrect, or your email is not confirmed',
    );

    await page.goto(await linkFromEmail(email));
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();

    // The session cookie must not be readable by page scripts.
    const cookies = await page.context().cookies();
    const session = cookies.filter((c) => c.name.startsWith('sb-'));
    expect(session.length).toBeGreaterThan(0);
    expect(session.every((c) => c.httpOnly)).toBe(true);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);

    const invites = await admin.from('beta_invites').select('used_at').eq('email', email).single();
    expect(invites.data?.used_at).not.toBeNull();
  });

  test('an uninvited email gets the same message but no account and no email', async ({ page }) => {
    const email = newEmail('uninvited');
    await fillSignUp(page, email);
    await expect(page.getByText(SIGNUP_SENT)).toBeVisible();
    await page.waitForTimeout(2_000);
    expect(await userExists(email)).toBe(false);
    expect(await emailCount(email)).toBe(0);
  });

  test('a used invitation cannot create a second account', async ({ page }) => {
    const email = newEmail('reuse');
    await invite(email);
    await fillSignUp(page, email);
    await expect(page.getByText(SIGNUP_SENT)).toBeVisible();
    await fillSignUp(page, email);
    await expect(page.getByText(SIGNUP_SENT)).toBeVisible();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.filter((u) => u.email === email)).toHaveLength(1);
  });

  test('wrong password shows a generic error', async ({ page }) => {
    const email = newEmail('wrongpw');
    await createConfirmedStudent(email);
    await logIn(page, email, 'not-the-password');
    await expect(page.locator('p[role="alert"]')).toContainText('Email or password is incorrect');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a log-in link never creates an account, and works for real students', async ({ page }) => {
    const stranger = newEmail('stranger');
    await page.goto('/login');
    const linkForm = page.getByRole('form', { name: 'Email me a log-in link' });
    await linkForm.getByLabel('Email').fill(stranger);
    await linkForm.getByRole('button', { name: 'Email me a log-in link' }).click();
    await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
    expect(await userExists(stranger)).toBe(false);

    const email = newEmail('magic');
    await createConfirmedStudent(email);
    await linkForm.getByLabel('Email').fill(email);
    await linkForm.getByRole('button', { name: 'Email me a log-in link' }).click();
    await page.goto(await linkFromEmail(email));
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  });

  test('password reset by email lets the student choose a new password', async ({ page }) => {
    const email = newEmail('reset');
    await createConfirmedStudent(email);
    await page.goto('/reset-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/If an account exists for this email/)).toBeVisible();

    await page.goto(await linkFromEmail(email));
    await expect(page).toHaveURL(/\/account\/password$/);
    await page.getByLabel(/New password/).fill('a-brand-new-password');
    await page.getByLabel('Type it again').fill('a-brand-new-password');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Log out' }).click();
    await logIn(page, email, 'a-brand-new-password');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('an invalid or reused email link is rejected', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=not-a-real-token-hash&type=email');
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(page.locator('p[role="alert"]')).toContainText('invalid or has expired');
  });

  test('log-in never redirects to another website', async ({ page }) => {
    const email = newEmail('redirect');
    await createConfirmedStudent(email);
    await page.goto('/login?next=https://evil.example/steal');
    const form = page.getByRole('form', { name: 'Log in with password' });
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('Password').fill(PASSWORD);
    await form.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:3000\/dashboard$/);
  });

  // Runs last: publishing a new terms version affects every later log-in in this run.
  test('a new terms version makes students accept it before continuing', async ({ page }) => {
    const email = newEmail('reconsent');
    await createConfirmedStudent(email);
    const version = `e2e-${Date.now()}`;
    const { error } = await admin
      .from('consent_documents')
      .insert({ kind: 'terms', version, published_at: new Date().toISOString() });
    expect(error).toBeNull();

    await logIn(page, email);
    await expect(page).toHaveURL(/\/consent\?next=%2Fdashboard$/);
    await page.getByRole('button', { name: 'Continue' }).click(); // nothing ticked
    await expect(page).toHaveURL(/\/consent/);
    await page.getByLabel(/updated terms of use/).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const rows = await admin
      .from('consents')
      .select('version')
      .eq('kind', 'terms')
      .eq('version', version);
    expect(rows.data).toHaveLength(1);
  });
});
