import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ExamSaathi AI',
  description: 'Personalised preparation for Maharashtra government exams.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f4e79',
};

// Every page is rendered per request so the CSP nonce (set in proxy.ts) can be applied.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
