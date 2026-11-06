'use client';

// Styled error page under our strict CSP (review 0003 #12). Never shows error details.
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p className="muted">Please try again. If it keeps happening, try again in a few minutes.</p>
      <button type="button" className="btn" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
