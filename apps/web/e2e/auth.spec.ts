import { expect, test, type Page } from '@playwright/test';
import {
  admin,
  createConfirmedStudent,
  emailCount,
  followEmailLink,
  invite,
  linkFromEmail,
  logIn,
  newEmail,
  PASSWORD,
  userExists,
} from './helpers';

const SIGNUP_SENT = /If this email has a beta invitation/;
const formAlert = (page: Page) => page.locator('p[role="alert"]');

async function requestSignUp(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/18 years old or older/).check();
  await page.getByRole('button', { name: 'Send me the sign-up link' }).click();
  await expect(page.getByText(SIGNUP_SENT)).toBeVisible();
}

async function choosePassword(page: Page, password: string) {
  await expect(page).toHaveURL(/\/account\/password$/);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel('Type it again').fill(password);
  await page.getByRole('button', { name: 'Save password' }).click();
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
    for (const path of ['/', '/login', '/signup', '/reset-password', '/does-not-exist']) {
      const res = await page.goto(path);
      expect(res?.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
    }
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('an invited student confirms by email, chooses a password, accepts and reaches the dashboard', async ({
    page,
  }) => {
    const email = newEmail('signup');
    await invite(email);
    await requestSignUp(page, email);
    expect(await userExists(email)).toBe(true);

    // Opening the link alone must not log anyone in (login-CSRF / email-scanner protection).
    await page.goto(await linkFromEmail(email));
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

    await followEmailLink(page, email);
    await choosePassword(page, PASSWORD);
    await expect(page).toHaveURL(/\/consent\?next=%2Fdashboard$/);
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
    await page.getByLabel(/18 years old or older/).check();
    await page.getByLabel(/privacy notice/).check();
    await page.getByLabel(/terms of use/).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();

    // The session cookie must not be readable by page scripts.
    const session = (await page.context().cookies()).filter((c) => c.name.startsWith('sb-'));
    expect(session.length).toBeGreaterThan(0);
    expect(session.every((c) => c.httpOnly)).toBe(true);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);

    const inv = await admin.from('beta_invites').select('used_at').eq('email', email).single();
    expect(inv.data?.used_at).not.toBeNull();
  });

  test('an uninvited email gets the same message but no account and no email', async ({ page }) => {
    const email = newEmail('uninvited');
    await requestSignUp(page, email);
    await page.waitForTimeout(2_000);
    expect(await userExists(email)).toBe(false);
    expect(await emailCount(email)).toBe(0);
  });

  test('repeating sign-up re-sends the link but never creates a second account', async ({
    page,
  }) => {
    const email = newEmail('repeat');
    await invite(email);
    await requestSignUp(page, email);
    await linkFromEmail(email, 1);
    await page.waitForTimeout(1_500); // Supabase allows one email per second per address
    await requestSignUp(page, email);
    await linkFromEmail(email, 2);
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.filter((u) => u.email === email)).toHaveLength(1);
  });

  test('a log-in link is never sent to an unconfirmed account', async ({ page }) => {
    const email = newEmail('unconfirmed');
    await invite(email);
    await requestSignUp(page, email);
    await linkFromEmail(email, 1);
    await page.goto('/login');
    const linkForm = page.getByRole('form', { name: 'Email me a log-in link' });
    await linkForm.getByLabel('Email').fill(email);
    await linkForm.getByRole('button', { name: 'Email me a log-in link' }).click();
    await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
    await page.waitForTimeout(2_000);
    expect(await emailCount(email)).toBe(1);
  });

  test('wrong password shows a generic error', async ({ page }) => {
    const email = newEmail('wrongpw');
    await createConfirmedStudent(email);
    await logIn(page, email, 'not-the-password');
    await expect(formAlert(page)).toContainText('Email or password is incorrect');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a log-in link never creates an account, and works for real students', async ({ page }) => {
    const stranger = newEmail('stranger');
    await page.goto('/login');
    const linkForm = page.getByRole('form', { name: 'Email me a log-in link' });
    await linkForm.getByLabel('Email').fill(stranger);
    await linkForm.getByRole('button', { name: 'Email me a log-in link' }).click();
    await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(await userExists(stranger)).toBe(false);

    const email = newEmail('magic');
    await createConfirmedStudent(email);
    await linkForm.getByLabel('Email').fill(email);
    await linkForm.getByRole('button', { name: 'Email me a log-in link' }).click();
    await followEmailLink(page, email);
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  });

  test('password reset by email lets the student choose a new password', async ({ page }) => {
    const email = newEmail('reset');
    await createConfirmedStudent(email);
    await page.goto('/reset-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/If an account exists for this email/)).toBeVisible();

    await followEmailLink(page, email);
    await choosePassword(page, 'a-brand-new-password');
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Log out' }).click();
    await logIn(page, email, 'a-brand-new-password');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('the password cannot be changed with only a logged-in session', async ({ page }) => {
    const email = newEmail('pwchange');
    await createConfirmedStudent(email);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/account/password');
    await expect(page.getByText(/For your security/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save password' })).toHaveCount(0);
  });

  test('an invalid email link is rejected', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=not-a-real-token-hash&type=email');
    await page.getByRole('button', { name: /^Continue/ }).click();
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(formAlert(page)).toContainText('invalid or has expired');
  });

  test('log-in never redirects to another website', async ({ page }) => {
    const email = newEmail('redirect');
    await createConfirmedStudent(email);
    for (const next of ['https://evil.example/steal', '/.//evil.example/x', '/%2e//evil.example']) {
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      const form = page.getByRole('form', { name: 'Log in with password' });
      await form.getByLabel('Email').fill(email);
      await form.getByLabel('Password').fill(PASSWORD);
      await form.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/127\.0\.0\.1:3000\/dashboard$/);
      await page.getByRole('button', { name: 'Log out' }).click();
    }
  });

  test('logging out invalidates the old session cookies', async ({ page, context }) => {
    const email = newEmail('logout');
    await createConfirmedStudent(email);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    const oldCookies = await context.cookies();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await context.addCookies(oldCookies);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
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
    await expect(
      page.getByRole('heading', { name: 'Please review before continuing' }),
    ).toBeVisible();

    // Bypass the browser's own "required" check to prove the server enforces it too.
    await page
      .locator('input[type="checkbox"]')
      .evaluateAll((els) => els.forEach((el) => el.removeAttribute('required')));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(formAlert(page)).toContainText('Please tick every box');

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
