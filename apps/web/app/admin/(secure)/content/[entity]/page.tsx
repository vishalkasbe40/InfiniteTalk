import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireStaff } from '@/lib/auth/staff';
import { loadTopLevel } from '@/lib/content/data';
import { ENTITIES, isEntityKey, SOURCE_KINDS } from '@/lib/content/entities';

export const metadata: Metadata = { title: 'Content list · ExamSaathi admin' };

// Lists top-level content types only (sources, exam groups); children are listed on their parent.
export default async function ContentListPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!isEntityKey(entity) || ENTITIES[entity].parent) notFound();
  const def = ENTITIES[entity];
  const { supabase } = await requireStaff(`/admin/content/${entity}`, [
    'admin',
    'content_reviewer',
  ]);
  const rows = await loadTopLevel(supabase, def);
  const kind = (v: unknown) => SOURCE_KINDS.find((k) => k.value === v)?.label ?? String(v);
  return (
    <main>
      <p>
        <Link href="/admin/content">← Exams and syllabus</Link>
      </p>
      <h1>{entity === 'sources' ? 'Official sources' : def.plural}</h1>
      {entity === 'sources' && (
        <p className="muted">The documents that exam facts and syllabi are taken from.</p>
      )}
      {rows.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="item-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/content/${entity}/${r.id}`}>{String(r[def.titleField])}</Link>
              {entity === 'sources' ? ` · ${kind(r.kind)}` : ''} <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
      <Link className="btn" href={`/admin/content/${entity}/new`}>
        Add {def.label.toLowerCase()}
      </Link>
    </main>
  );
}
