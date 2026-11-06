import Link from 'next/link';

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <p className="brand">
        <Link href="/">ExamSaathi</Link>
      </p>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
