import Link from 'next/link';
import { assertStaffMember, currentStaffRoles } from '@/lib/auth/staff';

// Every page below calls requireStaff itself (role + fresh authenticator code, with the right
// `next`); the database re-checks admin + two-step on every read/write. The layout only hides the
// area from non-staff and provides navigation; it must never redirect (review 0005 #1).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await assertStaffMember();
  const isAdmin = (await currentStaffRoles()).includes('admin');
  return (
    <div className="admin">
      <nav aria-label="Admin" className="admin-nav">
        <Link href="/admin">Admin</Link>
        <Link href="/admin/content">Exams and syllabus</Link>
        {isAdmin && <Link href="/admin/invites">Invitations</Link>}
        {isAdmin && <Link href="/admin/audit">Activity log</Link>}
        <Link href="/admin/security">Two-step security</Link>
        <Link href="/dashboard">Back to the app</Link>
      </nav>
      {children}
    </div>
  );
}
