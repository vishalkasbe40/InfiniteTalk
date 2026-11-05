import { expect, test } from '@playwright/test';
import {
  createConfirmedStudent,
  logIn,
  makeAdmin,
  newEmail,
  nextTotpWindow,
  totp,
} from './helpers';

test.describe.serial('admin area', () => {
  test('students do not see the admin area at all', async ({ page }) => {
    const email = newEmail('not-admin');
    await createConfirmedStudent(email);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('link', { name: 'Admin area' })).toHaveCount(0);
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(404);
    expect((await page.goto('/admin/mfa'))?.status()).toBe(404);
  });

  test('an admin sets up two-step verification, manages invitations and sees the activity log', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = newEmail('admin');
    await makeAdmin(await createConfirmedStudent(email));
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('link', { name: 'Admin area' }).click();

    // Password alone is not enough: set up the authenticator.
    await expect(page).toHaveURL(/\/admin\/mfa\?next=%2Fadmin$/);
    await page.getByRole('button', { name: 'Set up my authenticator app' }).click();
    const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    await page.getByLabel(/6-digit code/).fill('000000');
    await page.getByRole('button', { name: 'Confirm and continue' }).click();
    await expect(page.getByRole('alert')).toContainText('That code did not work');
    await page.getByLabel(/6-digit code/).fill(totp(secret));
    await page.getByRole('button', { name: 'Confirm and continue' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();

    // Invitations: add, reject duplicate, cancel.
    const invitee = newEmail('invitee');
    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Invitations' })
      .click();
    await page.getByLabel('Student’s email').fill(invitee.toUpperCase());
    await page.getByLabel(/Note/).fill('e2e batch');
    await page.getByRole('button', { name: 'Add invitation' }).click();
    await expect(page.getByRole('status')).toContainText(`Invitation added for ${invitee}`);
    await expect(page.getByRole('cell', { name: invitee })).toBeVisible();

    await page.getByLabel('Student’s email').fill(invitee);
    await page.getByRole('button', { name: 'Add invitation' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('already invited');
    await expect(page.getByLabel('Student’s email')).toHaveValue(invitee); // input kept

    await page.getByRole('button', { name: `Cancel invitation for ${invitee}` }).click();
    await expect(page.getByRole('cell', { name: invitee })).toHaveCount(0);

    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Activity log' })
      .click();
    await expect(page.getByRole('cell', { name: 'Invitation added' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Invitation cancelled' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Role granted (admin)' }).first()).toBeVisible();

    // A new log-in needs the code again (and an old code can't be reused).
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
