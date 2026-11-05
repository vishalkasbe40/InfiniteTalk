import { expect, test, type Page } from '@playwright/test';
import {
  createConfirmedStudent,
  followEmailLink,
  logIn,
  makeAdmin,
  newEmail,
  nextTotpWindow,
  totp,
} from './helpers';

async function logInWithEmailLink(page: Page, email: string, previousEmails = 0) {
  await page.goto('/login');
  const form = page.getByRole('form', { name: 'Email me a log-in link' });
  await form.getByLabel('Email').fill(email);
  await form.getByRole('button', { name: 'Email me a log-in link' }).click();
  await expect(page.getByText(/If an account exists for this email/)).toBeVisible();
  await followEmailLink(page, email, previousEmails + 1);
  await expect(page).toHaveURL(/\/dashboard$/);
}

const formAlert = (page: Page) => page.locator('p[role="alert"]');

test.describe.serial('admin area', () => {
  test('students do not see the admin area at all', async ({ page }) => {
    const email = newEmail('not-admin');
    await createConfirmedStudent(email);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('link', { name: 'Admin area' })).toHaveCount(0);
    expect((await page.goto('/admin'))?.status()).toBe(404);
    expect((await page.goto('/admin/invites'))?.status()).toBe(404);
    expect((await page.goto('/admin/mfa'))?.status()).toBe(404);
  });

  test('a password alone cannot set up the first authenticator', async ({ page }) => {
    const email = newEmail('admin-pw');
    await makeAdmin(await createConfirmedStudent(email));
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/mfa\?next=%2Fadmin$/);
    await expect(page.getByText(/needs a fresh log-in from an email link/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set up my authenticator app' })).toHaveCount(0);
  });

  test('an admin sets up two-step verification, manages invitations and security, and sees the activity log', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const email = newEmail('admin');
    await makeAdmin(await createConfirmedStudent(email));
    await logInWithEmailLink(page, email);
    await page.getByRole('link', { name: 'Admin area' }).click();

    // Set up the first authenticator (allowed: fresh email-link session).
    await expect(page).toHaveURL(/\/admin\/mfa\?next=%2Fadmin$/);
    await page.getByRole('button', { name: 'Set up my authenticator app' }).click();
    const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    await page.getByLabel(/6-digit code/).fill('000000');
    await page.getByRole('button', { name: 'Confirm and continue' }).click();
    await expect(formAlert(page)).toContainText('That code did not work');
    await page.getByLabel(/6-digit code/).fill(totp(secret));
    await page.getByRole('button', { name: 'Confirm and continue' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();

    // Invitations: add, reject duplicate (input kept), cancel.
    const nav = page.getByRole('navigation', { name: 'Admin' });
    const invitee = newEmail('invitee');
    await nav.getByRole('link', { name: 'Invitations' }).click();
    await page.getByLabel('Student’s email').fill(invitee.toUpperCase());
    await page.getByLabel(/Note/).fill('e2e batch');
    await page.getByRole('button', { name: 'Add invitation' }).click();
    await expect(page.getByRole('status')).toContainText(`Invitation added for ${invitee}`);
    await expect(page.getByRole('cell', { name: invitee })).toBeVisible();
    await page.getByLabel('Student’s email').fill(invitee);
    await page.getByRole('button', { name: 'Add invitation' }).click();
    await expect(formAlert(page)).toContainText('already invited');
    await expect(page.getByLabel('Student’s email')).toHaveValue(invitee);
    await page.getByRole('button', { name: `Cancel invitation for ${invitee}` }).click();
    await expect(page.getByRole('cell', { name: invitee })).toHaveCount(0);

    // Backup authenticator.
    await nav.getByRole('link', { name: 'Two-step security' }).click();
    await expect(page.getByTestId('authenticator-count')).toHaveText('1 authenticator set up.');
    await page.getByRole('button', { name: 'Set up my authenticator app' }).click();
    const backup = (await page.getByTestId('totp-secret').textContent())!.trim();
    expect(backup).not.toBe(secret);
    await page.getByLabel(/6-digit code/).fill(totp(backup));
    await page.getByRole('button', { name: 'Confirm and continue' }).click();
    await expect(page).toHaveURL(/\/admin\/security$/);
    await expect(page.getByTestId('authenticator-count')).toHaveText('2 authenticators set up.');

    // Activity log shows invitation and two-step events.
    await nav.getByRole('link', { name: 'Activity log' }).click();
    for (const label of [
      'Invitation added',
      'Invitation cancelled',
      'Role granted (admin)',
      'mfa.enrolled',
      'mfa.verify_failed',
    ]) {
      await expect(page.getByRole('cell', { name: label }).first()).toBeVisible();
    }

    // A new log-in needs a code again, and returns to the page that was asked for.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Log out' }).click();
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/admin/invites');
    await expect(page).toHaveURL(/\/admin\/mfa\?next=%2Fadmin%2Finvites$/);
    await nextTotpWindow();
    await page.getByLabel(/6-digit code/).fill(totp(secret));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/admin\/invites$/);
  });
});
