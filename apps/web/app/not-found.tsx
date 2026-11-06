import Link from 'next/link';

// Custom page so the 404 is styled under our strict CSP (review 0003 #12).
export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist or has moved.</p>
      <Link href="/">Go to the home page</Link>
    </main>
  );
}
