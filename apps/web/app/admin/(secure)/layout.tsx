import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff';

// Every page below ALSO calls requireStaff itself; the database re-checks admin + two-step on
// every write. The layout only provides navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff('/admin');
  return (
    <div className="admin">
      <nav aria-label="Admin" className="admin-nav">
        <Link href="/admin">Admin</Link>
        <Link href="/admin/invites">Invitations</Link>
        <Link href="/admin/audit">Activity log</Link>
        <Link href="/dashboard">Back to the app</Link>
      </nav>
      {children}
    </div>
  );
}
