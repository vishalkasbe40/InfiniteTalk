import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>ExamSaathi AI</h1>
      <p>
        A personal study companion for MPSC aspirants: a diagnostic, a realistic study plan, and
        practice grounded in reviewed content.
      </p>
      <p className="muted">We are in early development, with a small, invite-only beta.</p>
      <div className="links">
        <Link href="/login">Log in</Link>
        <Link href="/signup">Have an invitation? Create your account</Link>
      </div>
    </main>
  );
}
