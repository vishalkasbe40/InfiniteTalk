import { expect, test } from '@playwright/test';
import { createConfirmedStudent, logIn, newEmail } from './helpers';

// Uses the clearly fictional sample taxonomy from supabase/seed.sql.
test.describe.serial('onboarding', () => {
  test('a new student sets up their preparation and sees it on the dashboard', async ({ page }) => {
    const email = newEmail('onboard');
    await createConfirmedStudent(email);
    await logIn(page, email);
    await expect(
      page.getByRole('heading', { name: 'Let’s set up your preparation' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText(/does not decide eligibility/)).toBeVisible();

    await page.getByLabel(/General Studies Paper I \(sample data\)/).check();
    await page.getByLabel('मराठी (Marathi)').check();
    const target = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Target date').fill(target);
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      await page.getByLabel(day).selectOption({ label: '2 h' });
    }
    await page.getByLabel('Saturday').selectOption({ label: '4 h' });
    await page.getByLabel('Sunday').selectOption({ label: 'Rest day' });
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    const summary = page.getByRole('region', { name: 'Your preparation' });
    await expect(summary).toContainText('General Studies Paper I (sample data)');
    await expect(summary).toContainText('14 h per week, on 6 days');
    await expect(summary).toContainText('मराठी (Marathi)');
    await expect(summary).toContainText(/\(1[78]\d days from today\)/);

    // Answers can be changed later and are pre-filled.
    await summary.getByRole('link', { name: 'Change these answers' }).click();
    await expect(page.getByLabel('Saturday')).toHaveValue('240');
    await page.getByLabel('Sunday').selectOption({ label: '1 h' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('region', { name: 'Your preparation' })).toContainText(
      '15 h per week, on 7 days',
    );
  });

  test('the server rejects a week with no study time', async ({ page }) => {
    const email = newEmail('onboard-zero');
    await createConfirmedStudent(email);
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/); // wait for the log-in to finish
    await page.goto('/onboarding');
    await page.getByLabel(/General Studies Paper I \(sample data\)/).check();
    await page
      .getByLabel('Target date')
      .fill(new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10));
    for (const day of [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]) {
      await page.getByLabel(day).selectOption({ label: 'Rest day' });
    }
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('at least 30 minutes');
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('onboarding requires log-in', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
  });
});
