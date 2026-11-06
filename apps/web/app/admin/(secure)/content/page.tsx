import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireStaff } from '@/lib/auth/staff';
import { loadTopLevel } from '@/lib/content/data';
import { ENTITIES } from '@/lib/content/entities';

export const metadata: Metadata = { title: 'Exams and syllabus · ExamSaathi admin' };

export default async function ContentHome() {
  const { supabase } = await requireStaff('/admin/content', ['admin', 'content_reviewer']);
  const [families, sources] = await Promise.all([
    loadTopLevel(supabase, ENTITIES.families),
    loadTopLevel(supabase, ENTITIES.sources),
  ]);
  return (
    <main>
      <h1>Exams and syllabus</h1>
      <p className="muted">
        Enter content from official documents only. New items start as drafts; students see an item
        only after it and everything above it is approved.
      </p>
      <section className="card" aria-labelledby="sources-h">
        <h2 id="sources-h">Official sources</h2>
        <p>
          {sources.length} sources ({sources.filter((s) => s.status === 'approved').length}{' '}
          approved). Add the official notification and syllabus first, so exams and papers can cite
          them.
        </p>
        <Link href="/admin/content/sources">Manage sources</Link>
      </section>
      <section className="card" aria-labelledby="families-h">
        <h2 id="families-h">Exam groups</h2>
        {families.length === 0 ? (
          <p className="muted">No exam groups yet.</p>
        ) : (
          <ul className="item-list">
            {families.map((f) => (
              <li key={f.id}>
                <Link href={`/admin/content/families/${f.id}`}>{String(f.name_en)}</Link>{' '}
                <StatusBadge status={f.status} />
              </li>
            ))}
          </ul>
        )}
        <Link className="btn" href="/admin/content/families/new">
          Add exam group
        </Link>
      </section>
    </main>
  );
}
