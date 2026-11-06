import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of use (draft) · ExamSaathi' };

// DRAFT placeholder (version 2026-11-draft1), pending legal review (CLAUDE.md §9).
export default function TermsPage() {
  return (
    <main>
      <h1>Terms of use</h1>
      <p className="notice">
        Draft for the closed beta (version 2026-11-draft1). This text is pending legal review and
        will be replaced. You will be asked to review the final version.
      </p>
      <ul>
        <li>ExamSaathi is a study aid. It does not guarantee selection, a rank, or a job.</li>
        <li>
          Exam dates, eligibility and syllabus must always be checked against the latest official
          notification.
        </li>
        <li>You must be 18 or older to use the beta.</li>
        <li>Keep your password private and do not share your account.</li>
        <li>The beta may change, have errors, or be paused while we improve it.</li>
      </ul>
    </main>
  );
}
