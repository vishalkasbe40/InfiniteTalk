import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/admin/status-badge';
import { requireStaff } from '@/lib/auth/staff';
import { loadChildren, loadCrumbs, loadItem, loadSourceOptions } from '@/lib/content/data';
import { ENTITIES, isEntityKey, SOURCE_KINDS } from '@/lib/content/entities';
import { ContentForm } from '../../content-form';
import { StatusControls } from '../../status-controls';

export const metadata: Metadata = { title: 'Content item · ExamSaathi admin' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContentItemPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  if (!isEntityKey(entity) || !uuid.test(id)) notFound();
  const def = ENTITIES[entity];
  const { supabase } = await requireStaff(`/admin/content/${entity}/${id}`, [
    'admin',
    'content_reviewer',
  ]);
  const row = await loadItem(supabase, def, id);
  if (!row) notFound();
  const parentId = def.parent ? (row[def.parent.column] as string) : null;
  const editable = row.status === 'draft' || row.status === 'in_review';
  const [crumbs, children, sources] = await Promise.all([
    loadCrumbs(supabase, def, parentId),
    loadChildren(supabase, def, id),
    editable && def.fields.some((f) => f.type === 'source')
      ? loadSourceOptions(supabase)
      : Promise.resolve([]),
  ]);
  const child = def.child ? ENTITIES[def.child] : undefined;
  const initial = Object.fromEntries(
    def.fields.map((f) => [f.name, row[f.name] == null ? '' : String(row[f.name])]),
  );
  const display = (name: string, v: unknown) =>
    name === 'kind'
      ? (SOURCE_KINDS.find((k) => k.value === v)?.label ?? String(v))
      : String(v ?? '—');

  return (
    <main>
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link href={entity === 'sources' ? '/admin/content/sources' : '/admin/content'}>
          {entity === 'sources' ? 'Sources' : 'Exams and syllabus'}
        </Link>
        {crumbs.map((c) => (
          <span key={c.href}>
            {' › '}
            <Link href={c.href}>{c.label}</Link>
          </span>
        ))}
      </nav>
      <h1>
        {def.label}: {String(row[def.titleField])} <StatusBadge status={row.status} />
      </h1>

      <section className="card" aria-labelledby="status-h">
        <h2 id="status-h">Review status</h2>
        <StatusControls entity={entity} id={id} status={row.status} />
      </section>

      <section className="card" aria-labelledby="details-h">
        <h2 id="details-h">Details</h2>
        {editable ? (
          <ContentForm
            entity={entity}
            initial={initial}
            id={id}
            parentId={parentId}
            sources={sources}
          />
        ) : (
          <dl className="facts">
            {def.fields
              .filter((f) => f.type !== 'source')
              .map((f) => (
                <div key={f.name} className="fact-row">
                  <dt>{f.label}</dt>
                  <dd>{display(f.name, row[f.name])}</dd>
                </div>
              ))}
          </dl>
        )}
      </section>

      {child && (
        <section className="card" aria-labelledby="children-h">
          <h2 id="children-h">{child.plural}</h2>
          {children.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="item-list">
              {children.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/content/${child.key}/${c.id}`}>
                    {String(c[child.titleField])}
                  </Link>{' '}
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
          {row.status !== 'retired' && (
            <Link className="btn" href={`/admin/content/${child.key}/new?parent=${id}`}>
              Add {child.label.toLowerCase()}
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
