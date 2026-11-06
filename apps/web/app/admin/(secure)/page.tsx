import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Admin · ExamSaathi' };

export default async function AdminHome() {
  const { supabase, roles } = await requireStaff('/admin', ['admin', 'content_reviewer']);
  const isAdmin = roles.includes('admin');
  const [invites, used] = await Promise.all([
    supabase.from('beta_invites').select('id', { count: 'exact', head: true }),
    supabase
      .from('beta_invites')
      .select('id', { count: 'exact', head: true })
      .not('used_at', 'is', null),
  ]);
  return (
    <main>
      <h1>Admin</h1>
      {isAdmin && (
        <section className="card" aria-labelledby="beta">
          <h2 id="beta">Closed beta</h2>
          <p>
            {invites.count ?? 0} invitations, {used.count ?? 0} used.
          </p>
          <Link className="btn" href="/admin/invites">
            Manage invitations
          </Link>
        </section>
      )}
      <section className="card" aria-labelledby="content">
        <h2 id="content">Exams and syllabus</h2>
        <p className="muted">
          Enter exams, papers and syllabi from official sources, and review them.
        </p>
        <Link className="btn" href="/admin/content">
          Open exams and syllabus
        </Link>
      </section>
    </main>
  );
}
