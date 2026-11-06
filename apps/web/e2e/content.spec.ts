import { expect, test, type Page } from '@playwright/test';
import { becomeVerifiedAdmin, createConfirmedStudent, logIn, newEmail } from './helpers';

const formAlert = (page: Page) => page.locator('p[role="alert"]');
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

async function addChild(
  page: Page,
  button: string,
  values: Record<string, string>,
  select: Record<string, string> = {},
) {
  await page.getByRole('link', { name: button }).click();
  for (const [label, v] of Object.entries(values))
    await page.getByLabel(label, { exact: false }).fill(v);
  for (const [label, v] of Object.entries(select))
    await page.getByLabel(label).selectOption({ label: v });
  await page.getByRole('button', { name: /^Create / }).click();
  await expect(page).toHaveURL(/\/admin\/content\/[a-z]+\/[0-9a-f-]{36}$/);
}

async function approve(page: Page) {
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(heading(page)).toContainText('In review');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(heading(page)).toContainText('Approved');
}

test('staff enter an exam from an official source, approve it top-down, and students can choose it', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const tag = Math.random().toString(36).slice(2, 7).toUpperCase();
  await becomeVerifiedAdmin(page, 'content_reviewer');
  // Reviewers can use content screens but not invitations or the activity log.
  const nav = page.getByRole('navigation', { name: 'Admin' });
  await expect(nav.getByRole('link', { name: 'Invitations' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Exams and syllabus' }).click();

  // 1. Official source.
  await page.getByRole('link', { name: 'Manage sources' }).click();
  await page.getByRole('link', { name: 'Add source' }).click();
  await page.getByLabel('Kind').selectOption({ label: 'Official syllabus' });
  await page.getByLabel('Title').fill(`E2E syllabus ${tag}`);
  await page.getByLabel(/Link/).fill('https://example.org/syllabus.pdf');
  await page.getByRole('button', { name: 'Create source' }).click();
  await approve(page);

  // 2. Exam group -> exam -> stage -> paper -> syllabus -> subject -> topic (all drafts).
  await page.goto('/admin/content');
  await addChild(page, 'Add exam group', {
    Code: `F${tag}`,
    'Name (English)': `Exam group ${tag}`,
  });
  const familyUrl = page.url();
  await addChild(page, 'Add exam', { Code: `E${tag}`, 'Name (English)': `Exam ${tag}` });
  const examUrl = page.url();
  await addChild(page, 'Add stage', { Code: 'PRELIMS', 'Name (English)': 'Prelims' });
  const stageUrl = page.url();
  await addChild(
    page,
    'Add paper',
    { Code: 'GS1', 'Name (English)': `Paper ${tag}`, 'Duration (minutes)': '120' },
    { 'Official source': `E2E syllabus ${tag}` },
  );
  const paperUrl = page.url();
  await addChild(
    page,
    'Add syllabus version',
    { Label: `Syllabus ${tag}`, 'Effective from': '2026-01-01' },
    { 'Official source': `E2E syllabus ${tag}` },
  );
  const syllabusUrl = page.url();
  await addChild(page, 'Add subject', { 'Name (English)': 'History' });
  const subjectUrl = page.url();
  await addChild(page, 'Add topic', { 'Name (English)': 'Ancient India', 'Relative weight': '2' });
  const topicUrl = page.url();

  // 3. A child cannot be approved before its parent.
  await page.goto(examUrl);
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(formAlert(page)).toContainText('Approve the parent item first');
  await page.getByRole('button', { name: 'Send back to draft' }).click();
  await expect(heading(page)).toContainText('Draft');

  // 4. Approve top-down.
  for (const url of [familyUrl, examUrl, stageUrl, paperUrl, syllabusUrl, subjectUrl]) {
    await page.goto(url);
    await approve(page);
  }
  // Approved items can no longer be edited.
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

  // 5. A non-default weight needs a note.
  await page.goto(topicUrl);
  await page.getByRole('button', { name: 'Send for review' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(formAlert(page)).toContainText('weight note');
  await page.getByLabel('Why this weight').fill('The official syllabus lists two sub-areas here.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(heading(page)).toContainText('Approved');

  // 6. A student can now choose the new paper during onboarding.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Log out' }).click();
  const student = newEmail('content-student');
  await createConfirmedStudent(student);
  await logIn(page, student);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/onboarding');
  await expect(page.getByLabel(new RegExp(`Paper ${tag}`))).toBeVisible();
  await expect(page.getByText(`Exam ${tag} · Prelims · Paper ${tag}`)).toBeVisible();
});
