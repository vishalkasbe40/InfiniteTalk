import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy notice (draft) · ExamSaathi' };

// DRAFT placeholder (version 2026-11-draft1). Must be replaced by a counsel-reviewed text before
// real users join (CLAUDE.md §9, ADR 0001 R1-R3); a new version triggers re-consent.
export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy notice</h1>
      <p className="notice">
        Draft for the closed beta (version 2026-11-draft1). This text is pending legal review and
        will be replaced. You will be asked to review the final version.
      </p>
      <h2>What we collect</h2>
      <p>
        Your email address, your password (stored only in a protected, hashed form by our
        authentication provider), your language and study preferences, and your learning activity in
        the app (answers, progress and plans).
      </p>
      <h2>Why</h2>
      <p>To run your account, personalise your study plan, and improve the service.</p>
      <h2>Who can see it</h2>
      <p>
        Only you, and a small number of authorised ExamSaathi staff for support and safety. We do
        not sell your data or show it to other students.
      </p>
      <h2>Your choices</h2>
      <p>
        You can ask us for a copy of your data or ask us to delete your account. Data is stored in
        India (Mumbai region).
      </p>
    </main>
  );
}
